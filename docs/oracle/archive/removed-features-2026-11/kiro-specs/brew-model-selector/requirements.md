# Requirements Document

## Introduction

The brew chat currently hardcodes Anthropic Claude Sonnet 4 as its sole AI provider for the exploration conversation and tool loop. This feature adds a model selector to the brew chat UI, enabling the user to switch between multiple AI providers (Anthropic, Google Gemini, DeepSeek) mid-session. The goal is to experiment with different cost/quality tradeoffs without code changes — allowing A/B comparison of providers during actual brew sessions while reducing daily AI spend from ~$1.20/day.

## Glossary

- **Model_Selector**: The UI dropdown component that allows users to choose an AI model for the brew conversation
- **Provider_Adapter**: A module that translates tool definitions and tool-use responses between the internal format and a specific provider's API format (Anthropic tool_use blocks, Gemini functionCall, DeepSeek OpenAI-compatible)
- **Tool_Loop**: The iterative cycle in `tool-executor.ts` where the system calls an AI model, detects tool-use requests, executes tools, appends results, and re-invokes the model until a final text response is produced
- **Brew_Session**: A persisted chat session stored in the SQLite database with conversation history, decision log, and configuration
- **Decision_Extractor**: The secondary Haiku call that extracts strategic decisions from assistant responses
- **Provider_Config**: Environment variable configuration containing API keys and endpoint URLs for each supported provider

## Requirements

### Requirement 1: Model Registry

**User Story:** As a developer, I want a centralized model registry with pricing and capability metadata, so that the UI and backend can reference consistent model information.

#### Acceptance Criteria

1. THE Model_Registry SHALL define entries for Anthropic Claude Sonnet 4, Gemini 3.5 Flash, Gemini 2.5 Flash, DeepSeek V4 Pro, and DeepSeek V4 Flash
2. WHEN a model entry is defined, THE Model_Registry SHALL include the provider name, model identifier string, display label, input cost per million tokens, and output cost per million tokens
3. THE Model_Registry SHALL expose a function to retrieve a model configuration by its identifier
4. THE Model_Registry SHALL designate Anthropic Claude Sonnet 4 as the default model

### Requirement 2: Provider Adapter Layer

**User Story:** As a developer, I want a provider-agnostic adapter layer, so that the tool loop can work with any supported AI provider without provider-specific logic in the main execution path.

#### Acceptance Criteria

1. THE Provider_Adapter SHALL translate internal tool definitions (Anthropic format) into each provider's native function calling format before sending API requests
2. THE Provider_Adapter SHALL translate each provider's native tool-use response format back into a normalized internal format that the Tool_Loop can process uniformly
3. WHEN the provider is Anthropic, THE Provider_Adapter SHALL use `tool_use` content blocks with `tool_use_id` fields for tool invocations
4. WHEN the provider is Gemini, THE Provider_Adapter SHALL use `functionCall` parts within the Gemini API format for tool invocations
5. WHEN the provider is DeepSeek, THE Provider_Adapter SHALL use OpenAI-compatible `tool_calls` with `function` objects for tool invocations
6. THE Provider_Adapter SHALL normalize stop reasons across providers so the Tool_Loop detects tool-use requests uniformly regardless of provider
7. IF a provider returns a malformed or unrecognized tool-use response, THEN THE Provider_Adapter SHALL return an error result with a descriptive message rather than crashing the Tool_Loop

### Requirement 3: Model Selector UI

**User Story:** As a user, I want a model selector in the brew chat interface, so that I can switch AI providers mid-session to compare quality and cost.

#### Acceptance Criteria

1. THE Model_Selector SHALL render as a compact dropdown near the chat input area displaying the currently selected model's label
2. WHEN the Model_Selector is opened, THE Model_Selector SHALL display all available models with their display labels and input/output pricing
3. WHEN the user selects a different model, THE Model_Selector SHALL update the displayed label to reflect the new selection immediately
4. WHILE a message is being streamed from the AI, THE Model_Selector SHALL be disabled to prevent mid-response model switching
5. THE Model_Selector SHALL indicate the current model's provider using a visual differentiator (icon or colour accent)

### Requirement 4: Session Model Persistence

**User Story:** As a user, I want my model choice to persist with the brew session, so that resuming a session uses the same model I last selected.

#### Acceptance Criteria

1. WHEN the user selects a model, THE Brew_Session SHALL store the selected model identifier in the database record for that session
2. WHEN a brew session is loaded, THE Model_Selector SHALL initialize to the model stored in the session record
3. IF a session has no stored model identifier, THEN THE Model_Selector SHALL default to Anthropic Claude Sonnet 4
4. WHEN the user changes the model mid-session, THE Brew_Session SHALL update the stored model identifier without creating a new session

### Requirement 5: Provider API Key Configuration

**User Story:** As a developer, I want provider API keys configured via environment variables, so that credentials are managed securely without code changes.

#### Acceptance Criteria

1. THE Provider_Config SHALL read Anthropic API credentials from the `ANTHROPIC_API_KEY` environment variable
2. THE Provider_Config SHALL read Google Gemini API credentials from a `GEMINI_API_KEY` environment variable
3. THE Provider_Config SHALL read DeepSeek API credentials from a `DEEPSEEK_API_KEY` environment variable
4. IF a required API key is missing for the selected provider, THEN THE Provider_Config SHALL return a clear error message indicating which key is missing
5. THE Provider_Config SHALL validate that API keys are present at application startup and log warnings for any missing provider keys

### Requirement 6: Tool Loop Provider Integration

**User Story:** As a developer, I want the tool execution loop to work with any configured provider, so that model switching does not break tool-use functionality.

#### Acceptance Criteria

1. WHEN a brew chat request specifies a model, THE Tool_Loop SHALL route the API call to the corresponding provider using the Provider_Adapter
2. THE Tool_Loop SHALL maintain identical tool execution behaviour (timeouts, max iterations, error handling) regardless of which provider is selected
3. WHEN a provider does not support a tool's parameter schema, THE Tool_Loop SHALL omit that tool from the request rather than sending an incompatible definition
4. IF the selected provider's API returns an error, THEN THE Tool_Loop SHALL surface the error to the SSE stream with the provider name included in the error message

### Requirement 7: Decision Extraction Independence

**User Story:** As a developer, I want the decision extraction step to remain on Anthropic Haiku regardless of the conversation model, so that extraction quality is consistent and the cheaper conversation models don't affect decision parsing.

#### Acceptance Criteria

1. THE Decision_Extractor SHALL use Anthropic Claude Haiku for extraction regardless of which model is selected for the main conversation
2. WHEN the main conversation uses a non-Anthropic provider, THE Decision_Extractor SHALL still receive the full assistant response text for extraction
3. IF the Anthropic API key is missing, THEN THE Decision_Extractor SHALL skip extraction gracefully and log a warning rather than failing the entire response

### Requirement 8: Cost Visibility

**User Story:** As a user, I want to see approximate cost information per message, so that I can make informed decisions about which model to use.

#### Acceptance Criteria

1. WHEN a model response completes, THE Brew_Session SHALL calculate the approximate cost based on input and output token counts and the model's pricing
2. THE Model_Selector dropdown SHALL display the per-million-token pricing for each model option
3. WHEN a message exchange completes, THE chat interface SHALL display the estimated cost for that exchange in a subtle, non-intrusive indicator
