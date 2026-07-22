# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: card-movement.spec.ts >> Status Counts >> deck page shows status filter bar with counts
- Location: tests/e2e/card-movement.spec.ts:92:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=/All —/').first()
Expected: visible
Timeout: 30000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 30000ms
  - waiting for locator('text=/All —/').first()

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - link "Skip to main content" [ref=e2] [cursor=pointer]:
    - /url: "#main-content"
  - complementary [ref=e3]:
    - generic [ref=e4]:
      - generic [ref=e5]: The Oracle
      - button "Collapse sidebar" [ref=e6]:
        - img
    - navigation "Main navigation" [ref=e7]:
      - link "Decks" [ref=e8] [cursor=pointer]:
        - /url: /
        - generic [ref=e9]:
          - generic [ref=e10]: grid_view
          - generic [ref=e11]: Decks
      - link "Card Management" [ref=e12] [cursor=pointer]:
        - /url: /allocation
        - generic [ref=e13]:
          - generic [ref=e14]: modeling
          - generic [ref=e15]: Card Management
      - link "Collection" [ref=e16] [cursor=pointer]:
        - /url: /collection
        - generic [ref=e17]:
          - generic [ref=e18]: newsstand
          - generic [ref=e19]: Collection
      - link "Binders" [ref=e20] [cursor=pointer]:
        - /url: /storage
        - generic [ref=e21]:
          - generic [ref=e22]: shelves
          - generic [ref=e23]: Binders
      - link "Scan" [ref=e24] [cursor=pointer]:
        - /url: /scan
        - generic [ref=e25]:
          - generic [ref=e26]: photo_camera
          - generic [ref=e27]: Scan
      - link "Brew Deck" [ref=e28] [cursor=pointer]:
        - /url: /new-deck
        - generic [ref=e29]:
          - generic [ref=e30]: science
          - generic [ref=e31]: Brew Deck
      - link "Settings" [ref=e32] [cursor=pointer]:
        - /url: /settings
        - generic [ref=e33]:
          - generic [ref=e34]: settings
          - generic [ref=e35]: Settings
    - button "Log out" [ref=e38]:
      - img [ref=e39]
      - generic [ref=e42]: Log out
  - main [ref=e43]:
    - generic [ref=e46]:
      - generic [ref=e48]:
        - generic [ref=e49]:
          - img "Wilhelt, the Rotcleaver avatar" [ref=e52]
          - generic [ref=e53]:
            - heading "A Rot to Process" [level=1] [ref=e55]
            - paragraph [ref=e56]: 100 cards · 0 proxies · $538.71
        - generic [ref=e57]:
          - button "Post-game debrief" [ref=e58]:
            - img
            - text: Post-game debrief
          - button "Copy decklist to clipboard" [ref=e59]:
            - img
            - generic [ref=e60]: Export
          - generic [ref=e61]:
            - switch "Allocate cards against collection" [checked] [ref=e62]
            - checkbox [checked] [ref=e63]
            - generic [ref=e64]: Allocate
          - radiogroup "Deck status" [ref=e65]:
            - radio "Set status to Brewing" [ref=e66]: Brewing
            - radio "Set status to In Rotation" [checked] [ref=e67]: In Rotation
            - radio "Set status to Graveyard" [ref=e68]: Graveyard
          - button "Delete deck" [ref=e69]:
            - img
            - generic [ref=e70]: Delete deck
      - generic [ref=e71]:
        - tablist [ref=e74]:
          - tab "Cards" [selected] [ref=e75]
          - tab "Analysis" [ref=e76]
          - tab "Combos" [ref=e77]
          - tab "Upgrade" [ref=e78]
          - tab "Strategy" [ref=e79]
          - tab "Goldfish" [ref=e80]
          - tab "Picklist" [ref=e81]
        - tabpanel "Cards" [ref=e82]:
          - generic [ref=e84]:
            - generic [ref=e86]:
              - generic [ref=e87]:
                - img
                - searchbox "Search cards" [ref=e88]
              - combobox "Group by" [ref=e89]:
                - 'option "Group: Category" [selected]'
                - 'option "Group: Type"'
                - 'option "Group: Status"'
                - 'option "Group: CMC"'
                - 'option "Group: Color"'
                - 'option "Group: Price"'
              - button "Sort by name. Click to cycle." [ref=e90]: "Sort: Name"
              - generic [ref=e92]:
                - generic:
                  - img
                - combobox "Search for a card to add" [ref=e93]
              - radiogroup "View mode" [ref=e94]:
                - radio "Categories view" [checked] [ref=e95]:
                  - img [ref=e96]
                - radio "Table view" [ref=e98]:
                  - img [ref=e99]
                - radio "Gallery view" [ref=e100]:
                  - img [ref=e101]
            - generic [ref=e107]:
              - generic [ref=e108]:
                - generic [ref=e109]:
                  - generic [ref=e110]: 100/100 Cards filled
                  - generic [ref=e111]:
                    - generic [ref=e112]: 100 Original
                    - generic [ref=e114]: 0 Proxy
                    - generic [ref=e116]: 0 In storage
                    - generic [ref=e118]: 0 In decks
                    - generic [ref=e120]: 0 Unowned
                - button "View Picklist" [ref=e126]
              - generic [ref=e127]:
                - generic [ref=e128]:
                  - generic [ref=e129]:
                    - button "Commander (1)" [expanded] [ref=e130]:
                      - generic [ref=e131]: Commander (1)
                      - img [ref=e132]
                    - list "Commander cards" [ref=e134]:
                      - listitem [ref=e135]:
                        - img [ref=e136]
                        - checkbox "Select Wilhelt, the Rotcleaver" [ref=e143]
                        - generic [ref=e144]: "1"
                        - generic [ref=e145]: Wilhelt, the Rotcleaver
                        - 'generic "Mana cost: {2}{U}{B}" [ref=e147]':
                          - generic [ref=e148]: 
                          - generic [ref=e149]: 
                          - generic [ref=e150]: 
                        - 'button "Wilhelt, the Rotcleaver status: original" [ref=e151] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e153]':
                            - generic [ref=e154]: circle
                            - text: Original
                        - button "More actions" [ref=e156]:
                          - img [ref=e157]
                  - generic [ref=e161]:
                    - button "Engine and Win (7)" [expanded] [ref=e162]:
                      - generic [ref=e163]: Engine and Win (7)
                      - img [ref=e164]
                    - list "Engine and Win cards" [ref=e166]:
                      - listitem [ref=e167]:
                        - img [ref=e168]
                        - checkbox "Select Grim Tutor" [ref=e175]
                        - generic [ref=e176]: "1"
                        - generic [ref=e177]: Grim Tutor
                        - 'generic "Mana cost: {1}{B}{B}" [ref=e179]':
                          - generic [ref=e180]: 
                          - generic [ref=e181]: 
                          - generic [ref=e182]: 
                        - 'button "Grim Tutor status: original" [ref=e183] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e185]':
                            - generic [ref=e186]: circle
                            - text: Original
                        - button "More actions" [ref=e188]:
                          - img [ref=e189]
                      - listitem [ref=e193]:
                        - img [ref=e194]
                        - checkbox "Select Living Death" [ref=e201]
                        - generic [ref=e202]: "1"
                        - generic [ref=e203]: Living Death
                        - 'generic "Mana cost: {3}{B}{B}" [ref=e205]':
                          - generic [ref=e206]: 
                          - generic [ref=e207]: 
                          - generic [ref=e208]: 
                        - 'button "Living Death status: original" [ref=e209] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e211]':
                            - generic [ref=e212]: circle
                            - text: Original
                        - button "More actions" [ref=e214]:
                          - img [ref=e215]
                      - listitem [ref=e219]:
                        - img [ref=e220]
                        - checkbox "Select Necroduality" [ref=e227]
                        - generic [ref=e228]: "1"
                        - generic [ref=e229]: Necroduality
                        - 'generic "Mana cost: {3}{U}" [ref=e231]':
                          - generic [ref=e232]: 
                          - generic [ref=e233]: 
                        - 'button "Necroduality status: original" [ref=e234] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e236]':
                            - generic [ref=e237]: circle
                            - text: Original
                        - button "More actions" [ref=e239]:
                          - img [ref=e240]
                      - listitem [ref=e244]:
                        - img [ref=e245]
                        - checkbox "Select Rooftop Storm" [ref=e252]
                        - generic [ref=e253]: "1"
                        - generic [ref=e254]: Rooftop Storm
                        - 'generic "Mana cost: {5}{U}" [ref=e256]':
                          - generic [ref=e257]: 
                          - generic [ref=e258]: 
                        - 'button "Rooftop Storm status: original" [ref=e259] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e261]':
                            - generic [ref=e262]: circle
                            - text: Original
                        - button "More actions" [ref=e264]:
                          - img [ref=e265]
                      - listitem [ref=e269]:
                        - img [ref=e270]
                        - checkbox "Select Sidisi, Undead Vizier" [ref=e277]
                        - generic [ref=e278]: "1"
                        - generic [ref=e279]: Sidisi, Undead Vizier
                        - 'generic "Mana cost: {3}{B}{B}" [ref=e281]':
                          - generic [ref=e282]: 
                          - generic [ref=e283]: 
                          - generic [ref=e284]: 
                        - 'button "Sidisi, Undead Vizier status: original" [ref=e285] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e287]':
                            - generic [ref=e288]: circle
                            - text: Original
                        - button "More actions" [ref=e290]:
                          - img [ref=e291]
                      - listitem [ref=e295]:
                        - img [ref=e296]
                        - checkbox "Select Tombstone Stairwell" [ref=e303]
                        - generic [ref=e304]: "1"
                        - generic [ref=e305]: Tombstone Stairwell
                        - 'generic "Mana cost: {2}{B}{B}" [ref=e307]':
                          - generic [ref=e308]: 
                          - generic [ref=e309]: 
                          - generic [ref=e310]: 
                        - 'button "Tombstone Stairwell status: original" [ref=e311] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e313]':
                            - generic [ref=e314]: circle
                            - text: Original
                        - button "More actions" [ref=e316]:
                          - img [ref=e317]
                      - listitem [ref=e321]:
                        - img [ref=e322]
                        - checkbox "Select Zombie Apocalypse" [ref=e329]
                        - generic [ref=e330]: "1"
                        - generic [ref=e331]: Zombie Apocalypse
                        - 'generic "Mana cost: {3}{B}{B}{B}" [ref=e333]':
                          - generic [ref=e334]: 
                          - generic [ref=e335]: 
                          - generic [ref=e336]: 
                          - generic [ref=e337]: 
                        - 'button "Zombie Apocalypse status: original" [ref=e338] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e340]':
                            - generic [ref=e341]: circle
                            - text: Original
                        - button "More actions" [ref=e343]:
                          - img [ref=e344]
                  - generic [ref=e348]:
                    - button "More Bodies (11)" [expanded] [ref=e349]:
                      - generic [ref=e350]: More Bodies (11)
                      - img [ref=e351]
                    - list "More Bodies cards" [ref=e353]:
                      - listitem [ref=e354]:
                        - img [ref=e355]
                        - checkbox "Select Butcher Ghoul" [ref=e362]
                        - generic [ref=e363]: "1"
                        - generic [ref=e364]: Butcher Ghoul
                        - 'generic "Mana cost: {1}{B}" [ref=e366]':
                          - generic [ref=e367]: 
                          - generic [ref=e368]: 
                        - 'button "Butcher Ghoul status: original" [ref=e369] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e371]':
                            - generic [ref=e372]: circle
                            - text: Original
                        - button "More actions" [ref=e374]:
                          - img [ref=e375]
                      - listitem [ref=e379]:
                        - img [ref=e380]
                        - checkbox "Select Champion of the Perished" [ref=e387]
                        - generic [ref=e388]: "1"
                        - generic [ref=e389]: Champion of the Perished
                        - 'generic "Mana cost: {B}" [ref=e391]':
                          - generic [ref=e392]: 
                        - 'button "Champion of the Perished status: original" [ref=e393] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e395]':
                            - generic [ref=e396]: circle
                            - text: Original
                        - button "More actions" [ref=e398]:
                          - img [ref=e399]
                      - listitem [ref=e403]:
                        - img [ref=e404]
                        - checkbox "Select Cryptbreaker" [ref=e411]
                        - generic [ref=e412]: "1"
                        - generic [ref=e413]: Cryptbreaker
                        - 'generic "Mana cost: {B}" [ref=e415]':
                          - generic [ref=e416]: 
                        - 'button "Cryptbreaker status: original" [ref=e417] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e419]':
                            - generic [ref=e420]: circle
                            - text: Original
                        - button "More actions" [ref=e422]:
                          - img [ref=e423]
                      - listitem [ref=e427]:
                        - img [ref=e428]
                        - checkbox "Select Diregraf Colossus" [ref=e435]
                        - generic [ref=e436]: "1"
                        - generic [ref=e437]: Diregraf Colossus
                        - 'generic "Mana cost: {2}{B}" [ref=e439]':
                          - generic [ref=e440]: 
                          - generic [ref=e441]: 
                        - 'button "Diregraf Colossus status: original" [ref=e442] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e444]':
                            - generic [ref=e445]: circle
                            - text: Original
                        - button "More actions" [ref=e447]:
                          - img [ref=e448]
                      - listitem [ref=e452]:
                        - img [ref=e453]
                        - checkbox "Select Gravecrawler" [ref=e460]
                        - generic [ref=e461]: "1"
                        - generic [ref=e462]: Gravecrawler
                        - 'generic "Mana cost: {B}" [ref=e464]':
                          - generic [ref=e465]: 
                        - 'button "Gravecrawler status: original" [ref=e466] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e468]':
                            - generic [ref=e469]: circle
                            - text: Original
                        - button "More actions" [ref=e471]:
                          - img [ref=e472]
                      - listitem [ref=e476]:
                        - img [ref=e477]
                        - checkbox "Select Jadar, Ghoulcaller of Nephalia" [ref=e484]
                        - generic [ref=e485]: "1"
                        - generic [ref=e486]: Jadar, Ghoulcaller of Nephalia
                        - 'generic "Mana cost: {1}{B}" [ref=e488]':
                          - generic [ref=e489]: 
                          - generic [ref=e490]: 
                        - 'button "Jadar, Ghoulcaller of Nephalia status: original" [ref=e491] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e493]':
                            - generic [ref=e494]: circle
                            - text: Original
                        - button "More actions" [ref=e496]:
                          - img [ref=e497]
                      - listitem [ref=e501]:
                        - img [ref=e502]
                        - checkbox "Select Lazotep Reaver" [ref=e509]
                        - generic [ref=e510]: "1"
                        - generic [ref=e511]: Lazotep Reaver
                        - 'generic "Mana cost: {1}{B}" [ref=e513]':
                          - generic [ref=e514]: 
                          - generic [ref=e515]: 
                        - 'button "Lazotep Reaver status: original" [ref=e516] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e518]':
                            - generic [ref=e519]: circle
                            - text: Original
                        - button "More actions" [ref=e521]:
                          - img [ref=e522]
                      - listitem [ref=e526]:
                        - img [ref=e527]
                        - checkbox "Select Master of Death" [ref=e534]
                        - generic [ref=e535]: "1"
                        - generic [ref=e536]: Master of Death
                        - 'generic "Mana cost: {1}{U}{B}" [ref=e538]':
                          - generic [ref=e539]: 
                          - generic [ref=e540]: 
                          - generic [ref=e541]: 
                        - 'button "Master of Death status: original" [ref=e542] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e544]':
                            - generic [ref=e545]: circle
                            - text: Original
                        - button "More actions" [ref=e547]:
                          - img [ref=e548]
                      - listitem [ref=e552]:
                        - img [ref=e553]
                        - checkbox "Select Poppet Stitcher // Poppet Factory" [ref=e560]
                        - generic [ref=e561]: "1"
                        - generic [ref=e562]: Poppet Stitcher // Poppet Factory
                        - 'generic "Mana cost: {2}{U}" [ref=e564]':
                          - generic [ref=e565]: 
                          - generic [ref=e566]: 
                        - 'button "Poppet Stitcher // Poppet Factory status: original" [ref=e567] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e569]':
                            - generic [ref=e570]: circle
                            - text: Original
                        - button "More actions" [ref=e572]:
                          - img [ref=e573]
                      - listitem [ref=e577]:
                        - img [ref=e578]
                        - checkbox "Select Putrid Goblin" [ref=e585]
                        - generic [ref=e586]: "1"
                        - generic [ref=e587]: Putrid Goblin
                        - 'generic "Mana cost: {1}{B}" [ref=e589]':
                          - generic [ref=e590]: 
                          - generic [ref=e591]: 
                        - 'button "Putrid Goblin status: original" [ref=e592] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e594]':
                            - generic [ref=e595]: circle
                            - text: Original
                        - button "More actions" [ref=e597]:
                          - img [ref=e598]
                      - listitem [ref=e602]:
                        - img [ref=e603]
                        - checkbox "Select Relentless Dead" [ref=e610]
                        - generic [ref=e611]: "1"
                        - generic [ref=e612]: Relentless Dead
                        - 'generic "Mana cost: {B}{B}" [ref=e614]':
                          - generic [ref=e615]: 
                          - generic [ref=e616]: 
                        - 'button "Relentless Dead status: original" [ref=e617] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e619]':
                            - generic [ref=e620]: circle
                            - text: Original
                        - button "More actions" [ref=e622]:
                          - img [ref=e623]
                  - generic [ref=e627]:
                    - button "Recursion (4)" [expanded] [ref=e628]:
                      - generic [ref=e629]: Recursion (4)
                      - img [ref=e630]
                    - list "Recursion cards" [ref=e632]:
                      - listitem [ref=e633]:
                        - img [ref=e634]
                        - checkbox "Select Gisa and Geralf" [ref=e641]
                        - generic [ref=e642]: "1"
                        - generic [ref=e643]: Gisa and Geralf
                        - 'generic "Mana cost: {2}{U}{B}" [ref=e645]':
                          - generic [ref=e646]: 
                          - generic [ref=e647]: 
                          - generic [ref=e648]: 
                        - 'button "Gisa and Geralf status: original" [ref=e649] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e651]':
                            - generic [ref=e652]: circle
                            - text: Original
                        - button "More actions" [ref=e654]:
                          - img [ref=e655]
                      - listitem [ref=e659]:
                        - img [ref=e660]
                        - checkbox "Select Havengul Lich" [ref=e667]
                        - generic [ref=e668]: "1"
                        - generic [ref=e669]: Havengul Lich
                        - 'generic "Mana cost: {3}{U}{B}" [ref=e671]':
                          - generic [ref=e672]: 
                          - generic [ref=e673]: 
                          - generic [ref=e674]: 
                        - 'button "Havengul Lich status: original" [ref=e675] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e677]':
                            - generic [ref=e678]: circle
                            - text: Original
                        - button "More actions" [ref=e680]:
                          - img [ref=e681]
                      - listitem [ref=e685]:
                        - img [ref=e686]
                        - checkbox "Select Lord of the Undead" [ref=e693]
                        - generic [ref=e694]: "1"
                        - generic [ref=e695]: Lord of the Undead
                        - 'generic "Mana cost: {1}{B}{B}" [ref=e697]':
                          - generic [ref=e698]: 
                          - generic [ref=e699]: 
                          - generic [ref=e700]: 
                        - 'button "Lord of the Undead status: original" [ref=e701] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e703]':
                            - generic [ref=e704]: circle
                            - text: Original
                        - button "More actions" [ref=e706]:
                          - img [ref=e707]
                      - listitem [ref=e711]:
                        - img [ref=e712]
                        - checkbox "Select Undead Butler" [ref=e719]
                        - generic [ref=e720]: "1"
                        - generic [ref=e721]: Undead Butler
                        - 'generic "Mana cost: {1}{B}" [ref=e723]':
                          - generic [ref=e724]: 
                          - generic [ref=e725]: 
                        - 'button "Undead Butler status: original" [ref=e726] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e728]':
                            - generic [ref=e729]: circle
                            - text: Original
                        - button "More actions" [ref=e731]:
                          - img [ref=e732]
                  - generic [ref=e736]:
                    - button "Removal (8)" [expanded] [ref=e737]:
                      - generic [ref=e738]: Removal (8)
                      - img [ref=e739]
                    - list "Removal cards" [ref=e741]:
                      - listitem [ref=e742]:
                        - img [ref=e743]
                        - checkbox "Select Accursed Marauder" [ref=e750]
                        - generic [ref=e751]: "1"
                        - generic [ref=e752]: Accursed Marauder
                        - 'generic "Mana cost: {1}{B}" [ref=e754]':
                          - generic [ref=e755]: 
                          - generic [ref=e756]: 
                        - 'button "Accursed Marauder status: original" [ref=e757] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e759]':
                            - generic [ref=e760]: circle
                            - text: Original
                        - button "More actions" [ref=e762]:
                          - img [ref=e763]
                      - listitem [ref=e767]:
                        - img [ref=e768]
                        - checkbox "Select Cyclonic Rift" [ref=e775]
                        - generic [ref=e776]: "1"
                        - generic [ref=e777]: Cyclonic Rift
                        - 'generic "Mana cost: {1}{U}" [ref=e779]':
                          - generic [ref=e780]: 
                          - generic [ref=e781]: 
                        - 'button "Cyclonic Rift status: original" [ref=e782] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e784]':
                            - generic [ref=e785]: circle
                            - text: Original
                        - button "More actions" [ref=e787]:
                          - img [ref=e788]
                      - listitem [ref=e792]:
                        - img [ref=e793]
                        - checkbox "Select Fatal Push" [ref=e800]
                        - generic [ref=e801]: "1"
                        - generic [ref=e802]: Fatal Push
                        - 'generic "Mana cost: {B}" [ref=e804]':
                          - generic [ref=e805]: 
                        - 'button "Fatal Push status: original" [ref=e806] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e808]':
                            - generic [ref=e809]: circle
                            - text: Original
                        - button "More actions" [ref=e811]:
                          - img [ref=e812]
                      - listitem [ref=e816]:
                        - img [ref=e817]
                        - checkbox "Select Feed the Swarm" [ref=e824]
                        - generic [ref=e825]: "1"
                        - generic [ref=e826]: Feed the Swarm
                        - 'generic "Mana cost: {1}{B}" [ref=e828]':
                          - generic [ref=e829]: 
                          - generic [ref=e830]: 
                        - 'button "Feed the Swarm status: original" [ref=e831] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e833]':
                            - generic [ref=e834]: circle
                            - text: Original
                        - button "More actions" [ref=e836]:
                          - img [ref=e837]
                      - listitem [ref=e841]:
                        - img [ref=e842]
                        - checkbox "Select Go for the Throat" [ref=e849]
                        - generic [ref=e850]: "1"
                        - generic [ref=e851]: Go for the Throat
                        - 'generic "Mana cost: {1}{B}" [ref=e853]':
                          - generic [ref=e854]: 
                          - generic [ref=e855]: 
                        - 'button "Go for the Throat status: original" [ref=e856] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e858]':
                            - generic [ref=e859]: circle
                            - text: Original
                        - button "More actions" [ref=e861]:
                          - img [ref=e862]
                      - listitem [ref=e866]:
                        - img [ref=e867]
                        - checkbox "Select Rapid Hybridization" [ref=e874]
                        - generic [ref=e875]: "1"
                        - generic [ref=e876]: Rapid Hybridization
                        - 'generic "Mana cost: {U}" [ref=e878]':
                          - generic [ref=e879]: 
                        - 'button "Rapid Hybridization status: original" [ref=e880] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e882]':
                            - generic [ref=e883]: circle
                            - text: Original
                        - button "More actions" [ref=e885]:
                          - img [ref=e886]
                      - listitem [ref=e890]:
                        - img [ref=e891]
                        - checkbox "Select Toxic Deluge" [ref=e898]
                        - generic [ref=e899]: "1"
                        - generic [ref=e900]: Toxic Deluge
                        - 'generic "Mana cost: {2}{B}" [ref=e902]':
                          - generic [ref=e903]: 
                          - generic [ref=e904]: 
                        - 'button "Toxic Deluge status: original" [ref=e905] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e907]':
                            - generic [ref=e908]: circle
                            - text: Original
                        - button "More actions" [ref=e910]:
                          - img [ref=e911]
                      - listitem [ref=e915]:
                        - img [ref=e916]
                        - checkbox "Select Withering Torment" [ref=e923]
                        - generic [ref=e924]: "1"
                        - generic [ref=e925]: Withering Torment
                        - 'generic "Mana cost: {2}{B}" [ref=e927]':
                          - generic [ref=e928]: 
                          - generic [ref=e929]: 
                        - 'button "Withering Torment status: original" [ref=e930] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e932]':
                            - generic [ref=e933]: circle
                            - text: Original
                        - button "More actions" [ref=e935]:
                          - img [ref=e936]
                - generic [ref=e940]:
                  - generic [ref=e941]:
                    - button "Aristocrats (10)" [expanded] [ref=e942]:
                      - generic [ref=e943]: Aristocrats (10)
                      - img [ref=e944]
                    - list "Aristocrats cards" [ref=e946]:
                      - listitem [ref=e947]:
                        - img [ref=e948]
                        - checkbox "Select Diregraf Captain" [ref=e955]
                        - generic [ref=e956]: "1"
                        - generic [ref=e957]: Diregraf Captain
                        - 'generic "Mana cost: {1}{U}{B}" [ref=e959]':
                          - generic [ref=e960]: 
                          - generic [ref=e961]: 
                          - generic [ref=e962]: 
                        - 'button "Diregraf Captain status: original" [ref=e963] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e965]':
                            - generic [ref=e966]: circle
                            - text: Original
                        - button "More actions" [ref=e968]:
                          - img [ref=e969]
                      - listitem [ref=e973]:
                        - img [ref=e974]
                        - checkbox "Select Gray Merchant of Asphodel" [ref=e981]
                        - generic [ref=e982]: "1"
                        - generic [ref=e983]: Gray Merchant of Asphodel
                        - 'generic "Mana cost: {3}{B}{B}" [ref=e985]':
                          - generic [ref=e986]: 
                          - generic [ref=e987]: 
                          - generic [ref=e988]: 
                        - 'button "Gray Merchant of Asphodel status: original" [ref=e989] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e991]':
                            - generic [ref=e992]: circle
                            - text: Original
                        - button "More actions" [ref=e994]:
                          - img [ref=e995]
                      - listitem [ref=e999]:
                        - img [ref=e1000]
                        - checkbox "Select Headless Rider" [ref=e1007]
                        - generic [ref=e1008]: "1"
                        - generic [ref=e1009]: Headless Rider
                        - 'generic "Mana cost: {2}{B}" [ref=e1011]':
                          - generic [ref=e1012]: 
                          - generic [ref=e1013]: 
                        - 'button "Headless Rider status: original" [ref=e1014] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1016]':
                            - generic [ref=e1017]: circle
                            - text: Original
                        - button "More actions" [ref=e1019]:
                          - img [ref=e1020]
                      - listitem [ref=e1024]:
                        - img [ref=e1025]
                        - checkbox "Select Mirkwood Bats" [ref=e1032]
                        - generic [ref=e1033]: "1"
                        - generic [ref=e1034]: Mirkwood Bats
                        - 'generic "Mana cost: {3}{B}" [ref=e1036]':
                          - generic [ref=e1037]: 
                          - generic [ref=e1038]: 
                        - 'button "Mirkwood Bats status: original" [ref=e1039] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1041]':
                            - generic [ref=e1042]: circle
                            - text: Original
                        - button "More actions" [ref=e1044]:
                          - img [ref=e1045]
                      - listitem [ref=e1049]:
                        - img [ref=e1050]
                        - checkbox "Select Noxious Ghoul" [ref=e1057]
                        - generic [ref=e1058]: "1"
                        - generic [ref=e1059]: Noxious Ghoul
                        - 'generic "Mana cost: {3}{B}{B}" [ref=e1061]':
                          - generic [ref=e1062]: 
                          - generic [ref=e1063]: 
                          - generic [ref=e1064]: 
                        - 'button "Noxious Ghoul status: original" [ref=e1065] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1067]':
                            - generic [ref=e1068]: circle
                            - text: Original
                        - button "More actions" [ref=e1070]:
                          - img [ref=e1071]
                      - listitem [ref=e1075]:
                        - img [ref=e1076]
                        - checkbox "Select Plague Belcher" [ref=e1083]
                        - generic [ref=e1084]: "1"
                        - generic [ref=e1085]: Plague Belcher
                        - 'generic "Mana cost: {2}{B}" [ref=e1087]':
                          - generic [ref=e1088]: 
                          - generic [ref=e1089]: 
                        - 'button "Plague Belcher status: original" [ref=e1090] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1092]':
                            - generic [ref=e1093]: circle
                            - text: Original
                        - button "More actions" [ref=e1095]:
                          - img [ref=e1096]
                      - listitem [ref=e1100]:
                        - img [ref=e1101]
                        - checkbox "Select The Meathook Massacre" [ref=e1108]
                        - generic [ref=e1109]: "1"
                        - generic [ref=e1110]: The Meathook Massacre
                        - 'generic "Mana cost: {X}{B}{B}" [ref=e1112]':
                          - generic [ref=e1113]: 
                          - generic [ref=e1114]: 
                          - generic [ref=e1115]: 
                        - 'button "The Meathook Massacre status: original" [ref=e1116] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1118]':
                            - generic [ref=e1119]: circle
                            - text: Original
                        - button "More actions" [ref=e1121]:
                          - img [ref=e1122]
                      - listitem [ref=e1126]:
                        - img [ref=e1127]
                        - checkbox "Select The Scarab God" [ref=e1134]
                        - generic [ref=e1135]: "1"
                        - generic [ref=e1136]: The Scarab God
                        - 'generic "Mana cost: {3}{U}{B}" [ref=e1138]':
                          - generic [ref=e1139]: 
                          - generic [ref=e1140]: 
                          - generic [ref=e1141]: 
                        - 'button "The Scarab God status: original" [ref=e1142] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1144]':
                            - generic [ref=e1145]: circle
                            - text: Original
                        - button "More actions" [ref=e1147]:
                          - img [ref=e1148]
                      - listitem [ref=e1152]:
                        - img [ref=e1153]
                        - checkbox "Select Undead Augur" [ref=e1160]
                        - generic [ref=e1161]: "1"
                        - generic [ref=e1162]: Undead Augur
                        - 'generic "Mana cost: {B}{B}" [ref=e1164]':
                          - generic [ref=e1165]: 
                          - generic [ref=e1166]: 
                        - 'button "Undead Augur status: original" [ref=e1167] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1169]':
                            - generic [ref=e1170]: circle
                            - text: Original
                        - button "More actions" [ref=e1172]:
                          - img [ref=e1173]
                      - listitem [ref=e1177]:
                        - img [ref=e1178]
                        - checkbox "Select Vengeful Dead" [ref=e1185]
                        - generic [ref=e1186]: "1"
                        - generic [ref=e1187]: Vengeful Dead
                        - 'generic "Mana cost: {3}{B}" [ref=e1189]':
                          - generic [ref=e1190]: 
                          - generic [ref=e1191]: 
                        - 'button "Vengeful Dead status: original" [ref=e1192] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1194]':
                            - generic [ref=e1195]: circle
                            - text: Original
                        - button "More actions" [ref=e1197]:
                          - img [ref=e1198]
                  - generic [ref=e1202]:
                    - button "Protection (5)" [expanded] [ref=e1203]:
                      - generic [ref=e1204]: Protection (5)
                      - img [ref=e1205]
                    - list "Protection cards" [ref=e1207]:
                      - listitem [ref=e1208]:
                        - img [ref=e1209]
                        - checkbox "Select Arcane Denial" [ref=e1216]
                        - generic [ref=e1217]: "1"
                        - generic [ref=e1218]: Arcane Denial
                        - 'generic "Mana cost: {1}{U}" [ref=e1220]':
                          - generic [ref=e1221]: 
                          - generic [ref=e1222]: 
                        - 'button "Arcane Denial status: original" [ref=e1223] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1225]':
                            - generic [ref=e1226]: circle
                            - text: Original
                        - button "More actions" [ref=e1228]:
                          - img [ref=e1229]
                      - listitem [ref=e1233]:
                        - img [ref=e1234]
                        - checkbox "Select Counterspell" [ref=e1241]
                        - generic [ref=e1242]: "1"
                        - generic [ref=e1243]: Counterspell
                        - 'generic "Mana cost: {U}{U}" [ref=e1245]':
                          - generic [ref=e1246]: 
                          - generic [ref=e1247]: 
                        - 'button "Counterspell status: original" [ref=e1248] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1250]':
                            - generic [ref=e1251]: circle
                            - text: Original
                        - button "More actions" [ref=e1253]:
                          - img [ref=e1254]
                      - listitem [ref=e1258]:
                        - img [ref=e1259]
                        - checkbox "Select Negate" [ref=e1266]
                        - generic [ref=e1267]: "1"
                        - generic [ref=e1268]: Negate
                        - 'generic "Mana cost: {1}{U}" [ref=e1270]':
                          - generic [ref=e1271]: 
                          - generic [ref=e1272]: 
                        - 'button "Negate status: original" [ref=e1273] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1275]':
                            - generic [ref=e1276]: circle
                            - text: Original
                        - button "More actions" [ref=e1278]:
                          - img [ref=e1279]
                      - listitem [ref=e1283]:
                        - img [ref=e1284]
                        - checkbox "Select Overcharged Amalgam" [ref=e1291]
                        - generic [ref=e1292]: "1"
                        - generic [ref=e1293]: Overcharged Amalgam
                        - 'generic "Mana cost: {2}{U}{U}" [ref=e1295]':
                          - generic [ref=e1296]: 
                          - generic [ref=e1297]: 
                          - generic [ref=e1298]: 
                        - 'button "Overcharged Amalgam status: original" [ref=e1299] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1301]':
                            - generic [ref=e1302]: circle
                            - text: Original
                        - button "More actions" [ref=e1304]:
                          - img [ref=e1305]
                      - listitem [ref=e1309]:
                        - img [ref=e1310]
                        - checkbox "Select Swan Song" [ref=e1317]
                        - generic [ref=e1318]: "1"
                        - generic [ref=e1319]: Swan Song
                        - 'generic "Mana cost: {U}" [ref=e1321]':
                          - generic [ref=e1322]: 
                        - 'button "Swan Song status: original" [ref=e1323] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1325]':
                            - generic [ref=e1326]: circle
                            - text: Original
                        - button "More actions" [ref=e1328]:
                          - img [ref=e1329]
                  - generic [ref=e1333]:
                    - button "Ramp (10)" [expanded] [ref=e1334]:
                      - generic [ref=e1335]: Ramp (10)
                      - img [ref=e1336]
                    - list "Ramp cards" [ref=e1338]:
                      - listitem [ref=e1339]:
                        - img [ref=e1340]
                        - checkbox "Select Arcane Signet" [ref=e1347]
                        - generic [ref=e1348]: "1"
                        - generic [ref=e1349]: Arcane Signet
                        - 'generic "Mana cost: {2}" [ref=e1351]':
                          - generic [ref=e1352]: 
                        - 'button "Arcane Signet status: original" [ref=e1353] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1355]':
                            - generic [ref=e1356]: circle
                            - text: Original
                        - button "More actions" [ref=e1358]:
                          - img [ref=e1359]
                      - listitem [ref=e1363]:
                        - img [ref=e1364]
                        - checkbox "Select Ashnod's Altar" [ref=e1371]
                        - generic [ref=e1372]: "1"
                        - generic [ref=e1373]: Ashnod's Altar
                        - 'generic "Mana cost: {3}" [ref=e1375]':
                          - generic [ref=e1376]: 
                        - 'button "Ashnod''s Altar status: original" [ref=e1377] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1379]':
                            - generic [ref=e1380]: circle
                            - text: Original
                        - button "More actions" [ref=e1382]:
                          - img [ref=e1383]
                      - listitem [ref=e1387]:
                        - img [ref=e1388]
                        - checkbox "Select Dark Ritual" [ref=e1395]
                        - generic [ref=e1396]: "1"
                        - generic [ref=e1397]: Dark Ritual
                        - 'generic "Mana cost: {B}" [ref=e1399]':
                          - generic [ref=e1400]: 
                        - 'button "Dark Ritual status: original" [ref=e1401] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1403]':
                            - generic [ref=e1404]: circle
                            - text: Original
                        - button "More actions" [ref=e1406]:
                          - img [ref=e1407]
                      - listitem [ref=e1411]:
                        - img [ref=e1412]
                        - checkbox "Select Dimir Signet" [ref=e1419]
                        - generic [ref=e1420]: "1"
                        - generic [ref=e1421]: Dimir Signet
                        - 'generic "Mana cost: {2}" [ref=e1423]':
                          - generic [ref=e1424]: 
                        - 'button "Dimir Signet status: original" [ref=e1425] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1427]':
                            - generic [ref=e1428]: circle
                            - text: Original
                        - button "More actions" [ref=e1430]:
                          - img [ref=e1431]
                      - listitem [ref=e1435]:
                        - img [ref=e1436]
                        - checkbox "Select Fellwar Stone" [ref=e1443]
                        - generic [ref=e1444]: "1"
                        - generic [ref=e1445]: Fellwar Stone
                        - 'generic "Mana cost: {2}" [ref=e1447]':
                          - generic [ref=e1448]: 
                        - 'button "Fellwar Stone status: original" [ref=e1449] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1451]':
                            - generic [ref=e1452]: circle
                            - text: Original
                        - button "More actions" [ref=e1454]:
                          - img [ref=e1455]
                      - listitem [ref=e1459]:
                        - img [ref=e1460]
                        - checkbox "Select Jet Medallion" [ref=e1467]
                        - generic [ref=e1468]: "1"
                        - generic [ref=e1469]: Jet Medallion
                        - 'generic "Mana cost: {2}" [ref=e1471]':
                          - generic [ref=e1472]: 
                        - 'button "Jet Medallion status: original" [ref=e1473] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1475]':
                            - generic [ref=e1476]: circle
                            - text: Original
                        - button "More actions" [ref=e1478]:
                          - img [ref=e1479]
                      - listitem [ref=e1483]:
                        - img [ref=e1484]
                        - checkbox "Select Shambling Ghast" [ref=e1491]
                        - generic [ref=e1492]: "1"
                        - generic [ref=e1493]: Shambling Ghast
                        - 'generic "Mana cost: {B}" [ref=e1495]':
                          - generic [ref=e1496]: 
                        - 'button "Shambling Ghast status: original" [ref=e1497] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1499]':
                            - generic [ref=e1500]: circle
                            - text: Original
                        - button "More actions" [ref=e1502]:
                          - img [ref=e1503]
                      - listitem [ref=e1507]:
                        - img [ref=e1508]
                        - checkbox "Select Sol Ring" [ref=e1515]
                        - generic [ref=e1516]: "1"
                        - generic [ref=e1517]: Sol Ring
                        - 'generic "Mana cost: {1}" [ref=e1519]':
                          - generic [ref=e1520]: 
                        - 'button "Sol Ring status: original" [ref=e1521] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1523]':
                            - generic [ref=e1524]: circle
                            - text: Original
                        - button "More actions" [ref=e1526]:
                          - img [ref=e1527]
                      - listitem [ref=e1531]:
                        - img [ref=e1532]
                        - checkbox "Select Talisman of Dominance" [ref=e1539]
                        - generic [ref=e1540]: "1"
                        - generic [ref=e1541]: Talisman of Dominance
                        - 'generic "Mana cost: {2}" [ref=e1543]':
                          - generic [ref=e1544]: 
                        - 'button "Talisman of Dominance status: original" [ref=e1545] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1547]':
                            - generic [ref=e1548]: circle
                            - text: Original
                        - button "More actions" [ref=e1550]:
                          - img [ref=e1551]
                      - listitem [ref=e1555]:
                        - img [ref=e1556]
                        - checkbox "Select Warren Soultrader" [ref=e1563]
                        - generic [ref=e1564]: "1"
                        - generic [ref=e1565]: Warren Soultrader
                        - 'generic "Mana cost: {2}{B}" [ref=e1567]':
                          - generic [ref=e1568]: 
                          - generic [ref=e1569]: 
                        - 'button "Warren Soultrader status: original" [ref=e1570] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1572]':
                            - generic [ref=e1573]: circle
                            - text: Original
                        - button "More actions" [ref=e1575]:
                          - img [ref=e1576]
                  - generic [ref=e1580]:
                    - button "Sac Outlet (1)" [expanded] [ref=e1581]:
                      - generic [ref=e1582]: Sac Outlet (1)
                      - img [ref=e1583]
                    - list "Sac Outlet cards" [ref=e1585]:
                      - listitem [ref=e1586]:
                        - img [ref=e1587]
                        - checkbox "Select Carrion Feeder" [ref=e1594]
                        - generic [ref=e1595]: "1"
                        - generic [ref=e1596]: Carrion Feeder
                        - 'generic "Mana cost: {B}" [ref=e1598]':
                          - generic [ref=e1599]: 
                        - 'button "Carrion Feeder status: original" [ref=e1600] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1602]':
                            - generic [ref=e1603]: circle
                            - text: Original
                        - button "More actions" [ref=e1605]:
                          - img [ref=e1606]
                - generic [ref=e1610]:
                  - generic [ref=e1611]:
                    - button "Draw (5)" [expanded] [ref=e1612]:
                      - generic [ref=e1613]: Draw (5)
                      - img [ref=e1614]
                    - list "Draw cards" [ref=e1616]:
                      - listitem [ref=e1617]:
                        - img [ref=e1618]
                        - checkbox "Select Distant Melody" [ref=e1625]
                        - generic [ref=e1626]: "1"
                        - generic [ref=e1627]: Distant Melody
                        - 'generic "Mana cost: {3}{U}" [ref=e1629]':
                          - generic [ref=e1630]: 
                          - generic [ref=e1631]: 
                        - 'button "Distant Melody status: original" [ref=e1632] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1634]':
                            - generic [ref=e1635]: circle
                            - text: Original
                        - button "More actions" [ref=e1637]:
                          - img [ref=e1638]
                      - listitem [ref=e1642]:
                        - img [ref=e1643]
                        - checkbox "Select Hordewing Skaab" [ref=e1650]
                        - generic [ref=e1651]: "1"
                        - generic [ref=e1652]: Hordewing Skaab
                        - 'generic "Mana cost: {4}{U}" [ref=e1654]':
                          - generic [ref=e1655]: 
                          - generic [ref=e1656]: 
                        - 'button "Hordewing Skaab status: original" [ref=e1657] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1659]':
                            - generic [ref=e1660]: circle
                            - text: Original
                        - button "More actions" [ref=e1662]:
                          - img [ref=e1663]
                      - listitem [ref=e1667]:
                        - img [ref=e1668]
                        - checkbox "Select Kindred Discovery" [ref=e1675]
                        - generic [ref=e1676]: "1"
                        - generic [ref=e1677]: Kindred Discovery
                        - 'generic "Mana cost: {3}{U}{U}" [ref=e1679]':
                          - generic [ref=e1680]: 
                          - generic [ref=e1681]: 
                          - generic [ref=e1682]: 
                        - 'button "Kindred Discovery status: original" [ref=e1683] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1685]':
                            - generic [ref=e1686]: circle
                            - text: Original
                        - button "More actions" [ref=e1688]:
                          - img [ref=e1689]
                      - listitem [ref=e1693]:
                        - img [ref=e1694]
                        - checkbox "Select Liliana, Dreadhorde General" [ref=e1701]
                        - generic [ref=e1702]: "1"
                        - generic [ref=e1703]: Liliana, Dreadhorde General
                        - 'generic "Mana cost: {4}{B}{B}" [ref=e1705]':
                          - generic [ref=e1706]: 
                          - generic [ref=e1707]: 
                          - generic [ref=e1708]: 
                        - 'button "Liliana, Dreadhorde General status: original" [ref=e1709] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1711]':
                            - generic [ref=e1712]: circle
                            - text: Original
                        - button "More actions" [ref=e1714]:
                          - img [ref=e1715]
                      - listitem [ref=e1719]:
                        - img [ref=e1720]
                        - checkbox "Select Skullclamp" [ref=e1727]
                        - generic [ref=e1728]: "1"
                        - generic [ref=e1729]: Skullclamp
                        - 'generic "Mana cost: {1}" [ref=e1731]':
                          - generic [ref=e1732]: 
                        - 'button "Skullclamp status: original" [ref=e1733] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1735]':
                            - generic [ref=e1736]: circle
                            - text: Original
                        - button "More actions" [ref=e1738]:
                          - img [ref=e1739]
                  - generic [ref=e1743]:
                    - button "Land (38) Convert all specific-printing lands to generic" [expanded] [ref=e1744]:
                      - generic [ref=e1745]: Land (38)
                      - button "Convert all specific-printing lands to generic" [ref=e1746]: Make all generic
                      - img [ref=e1747]
                    - list "Land cards" [ref=e1749]:
                      - listitem [ref=e1750]:
                        - generic [ref=e1751]:
                          - img [ref=e1752]
                          - checkbox "Select Island (ECL)" [ref=e1759]
                          - generic [ref=e1760]: "3"
                          - generic [ref=e1761]: Island (ECL)
                          - 'generic "Status: Original" [ref=e1763] [cursor=pointer]':
                            - generic [ref=e1764]: circle
                            - text: Original
                          - button "More actions" [ref=e1766]:
                            - img [ref=e1767]
                      - listitem [ref=e1771]:
                        - generic [ref=e1772]:
                          - img [ref=e1773]
                          - checkbox "Select Swamp (ECL)" [ref=e1780]
                          - generic [ref=e1781]: "15"
                          - generic [ref=e1782]: Swamp (ECL)
                          - 'generic "Status: Original" [ref=e1784] [cursor=pointer]':
                            - generic [ref=e1785]: circle
                            - text: Original
                          - button "More actions" [ref=e1787]:
                            - img [ref=e1788]
                      - listitem [ref=e1792]:
                        - img [ref=e1793]
                        - checkbox "Select Bojuka Bog" [ref=e1800]
                        - generic [ref=e1801]: "1"
                        - generic [ref=e1802]: Bojuka Bog
                        - 'button "Bojuka Bog status: original" [ref=e1803] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1805]':
                            - generic [ref=e1806]: circle
                            - text: Original
                        - button "More actions" [ref=e1808]:
                          - img [ref=e1809]
                      - listitem [ref=e1813]:
                        - img [ref=e1814]
                        - checkbox "Select Command Tower" [ref=e1821]
                        - generic [ref=e1822]: "1"
                        - generic [ref=e1823]: Command Tower
                        - 'button "Command Tower status: original" [ref=e1824] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1826]':
                            - generic [ref=e1827]: circle
                            - text: Original
                        - button "More actions" [ref=e1829]:
                          - img [ref=e1830]
                      - listitem [ref=e1834]:
                        - img [ref=e1835]
                        - checkbox "Select Darkwater Catacombs" [ref=e1842]
                        - generic [ref=e1843]: "1"
                        - generic [ref=e1844]: Darkwater Catacombs
                        - 'button "Darkwater Catacombs status: original" [ref=e1845] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1847]':
                            - generic [ref=e1848]: circle
                            - text: Original
                        - button "More actions" [ref=e1850]:
                          - img [ref=e1851]
                      - listitem [ref=e1855]:
                        - img [ref=e1856]
                        - checkbox "Select Drowned Catacomb" [ref=e1863]
                        - generic [ref=e1864]: "1"
                        - generic [ref=e1865]: Drowned Catacomb
                        - 'button "Drowned Catacomb status: original" [ref=e1866] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1868]':
                            - generic [ref=e1869]: circle
                            - text: Original
                        - button "More actions" [ref=e1871]:
                          - img [ref=e1872]
                      - listitem [ref=e1876]:
                        - img [ref=e1877]
                        - checkbox "Select Exotic Orchard" [ref=e1884]
                        - generic [ref=e1885]: "1"
                        - generic [ref=e1886]: Exotic Orchard
                        - 'button "Exotic Orchard status: original" [ref=e1887] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1889]':
                            - generic [ref=e1890]: circle
                            - text: Original
                        - button "More actions" [ref=e1892]:
                          - img [ref=e1893]
                      - listitem [ref=e1897]:
                        - img [ref=e1898]
                        - checkbox "Select Fabled Passage" [ref=e1905]
                        - generic [ref=e1906]: "1"
                        - generic [ref=e1907]: Fabled Passage
                        - 'button "Fabled Passage status: original" [ref=e1908] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1910]':
                            - generic [ref=e1911]: circle
                            - text: Original
                        - button "More actions" [ref=e1913]:
                          - img [ref=e1914]
                      - listitem [ref=e1918]:
                        - img [ref=e1919]
                        - checkbox "Select Field of the Dead" [ref=e1926]
                        - generic [ref=e1927]: "1"
                        - generic [ref=e1928]: Field of the Dead
                        - 'button "Field of the Dead status: original" [ref=e1929] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1931]':
                            - generic [ref=e1932]: circle
                            - text: Original
                        - button "More actions" [ref=e1934]:
                          - img [ref=e1935]
                      - listitem [ref=e1939]:
                        - img [ref=e1940]
                        - checkbox "Select Flooded Strand" [ref=e1947]
                        - generic [ref=e1948]: "1"
                        - generic [ref=e1949]: Flooded Strand
                        - 'button "Flooded Strand status: original" [ref=e1950] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1952]':
                            - generic [ref=e1953]: circle
                            - text: Original
                        - button "More actions" [ref=e1955]:
                          - img [ref=e1956]
                      - listitem [ref=e1960]:
                        - img [ref=e1961]
                        - checkbox "Select Marsh Flats" [ref=e1968]
                        - generic [ref=e1969]: "1"
                        - generic [ref=e1970]: Marsh Flats
                        - 'button "Marsh Flats status: original" [ref=e1971] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1973]':
                            - generic [ref=e1974]: circle
                            - text: Original
                        - button "More actions" [ref=e1976]:
                          - img [ref=e1977]
                      - listitem [ref=e1981]:
                        - img [ref=e1982]
                        - checkbox "Select Morphic Pool" [ref=e1989]
                        - generic [ref=e1990]: "1"
                        - generic [ref=e1991]: Morphic Pool
                        - 'button "Morphic Pool status: original" [ref=e1992] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1994]':
                            - generic [ref=e1995]: circle
                            - text: Original
                        - button "More actions" [ref=e1997]:
                          - img [ref=e1998]
                      - listitem [ref=e2002]:
                        - img [ref=e2003]
                        - checkbox "Select Nephalia Drownyard" [ref=e2010]
                        - generic [ref=e2011]: "1"
                        - generic [ref=e2012]: Nephalia Drownyard
                        - 'button "Nephalia Drownyard status: original" [ref=e2013] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e2015]':
                            - generic [ref=e2016]: circle
                            - text: Original
                        - button "More actions" [ref=e2018]:
                          - img [ref=e2019]
                      - listitem [ref=e2023]:
                        - img [ref=e2024]
                        - checkbox "Select Phyrexian Tower" [ref=e2031]
                        - generic [ref=e2032]: "1"
                        - generic [ref=e2033]: Phyrexian Tower
                        - 'button "Phyrexian Tower status: original" [ref=e2034] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e2036]':
                            - generic [ref=e2037]: circle
                            - text: Original
                        - button "More actions" [ref=e2039]:
                          - img [ref=e2040]
                      - listitem [ref=e2044]:
                        - img [ref=e2045]
                        - checkbox "Select Polluted Delta" [ref=e2052]
                        - generic [ref=e2053]: "1"
                        - generic [ref=e2054]: Polluted Delta
                        - 'button "Polluted Delta status: original" [ref=e2055] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e2057]':
                            - generic [ref=e2058]: circle
                            - text: Original
                        - button "More actions" [ref=e2060]:
                          - img [ref=e2061]
                      - listitem [ref=e2065]:
                        - img [ref=e2066]
                        - checkbox "Select Shipwreck Marsh" [ref=e2073]
                        - generic [ref=e2074]: "1"
                        - generic [ref=e2075]: Shipwreck Marsh
                        - 'button "Shipwreck Marsh status: original" [ref=e2076] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e2078]':
                            - generic [ref=e2079]: circle
                            - text: Original
                        - button "More actions" [ref=e2081]:
                          - img [ref=e2082]
                      - listitem [ref=e2086]:
                        - img [ref=e2087]
                        - checkbox "Select Sunken Hollow" [ref=e2094]
                        - generic [ref=e2095]: "1"
                        - generic [ref=e2096]: Sunken Hollow
                        - 'button "Sunken Hollow status: original" [ref=e2097] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e2099]':
                            - generic [ref=e2100]: circle
                            - text: Original
                        - button "More actions" [ref=e2102]:
                          - img [ref=e2103]
                      - listitem [ref=e2107]:
                        - img [ref=e2108]
                        - checkbox "Select Sunken Ruins" [ref=e2115]
                        - generic [ref=e2116]: "1"
                        - generic [ref=e2117]: Sunken Ruins
                        - 'button "Sunken Ruins status: original" [ref=e2118] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e2120]':
                            - generic [ref=e2121]: circle
                            - text: Original
                        - button "More actions" [ref=e2123]:
                          - img [ref=e2124]
                      - listitem [ref=e2128]:
                        - img [ref=e2129]
                        - checkbox "Select Tainted Isle" [ref=e2136]
                        - generic [ref=e2137]: "1"
                        - generic [ref=e2138]: Tainted Isle
                        - 'button "Tainted Isle status: original" [ref=e2139] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e2141]':
                            - generic [ref=e2142]: circle
                            - text: Original
                        - button "More actions" [ref=e2144]:
                          - img [ref=e2145]
                      - listitem [ref=e2149]:
                        - img [ref=e2150]
                        - checkbox "Select Underground River" [ref=e2157]
                        - generic [ref=e2158]: "1"
                        - generic [ref=e2159]: Underground River
                        - 'button "Underground River status: original" [ref=e2160] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e2162]':
                            - generic [ref=e2163]: circle
                            - text: Original
                        - button "More actions" [ref=e2165]:
                          - img [ref=e2166]
                      - listitem [ref=e2170]:
                        - img [ref=e2171]
                        - checkbox "Select Unholy Grotto" [ref=e2178]
                        - generic [ref=e2179]: "1"
                        - generic [ref=e2180]: Unholy Grotto
                        - 'button "Unholy Grotto status: original" [ref=e2181] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e2183]':
                            - generic [ref=e2184]: circle
                            - text: Original
                        - button "More actions" [ref=e2186]:
                          - img [ref=e2187]
                      - listitem [ref=e2191]:
                        - img [ref=e2192]
                        - checkbox "Select Watery Grave" [ref=e2199]
                        - generic [ref=e2200]: "1"
                        - generic [ref=e2201]: Watery Grave
                        - 'button "Watery Grave status: original" [ref=e2202] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e2204]':
                            - generic [ref=e2205]: circle
                            - text: Original
                        - button "More actions" [ref=e2207]:
                          - img [ref=e2208]
            - generic [ref=e2213]:
              - generic [ref=e2216]: 100 original
              - generic [ref=e2219]: 0 proxied
              - generic [ref=e2222]: open
              - generic [ref=e2225]: 0 claimed
              - generic [ref=e2228]: 0 unowned
      - generic [ref=e2230]:
        - button "ok Ramp 10" [ref=e2231] [cursor=pointer]:
          - img [ref=e2232]
          - generic [ref=e2234]: Ramp
          - generic [ref=e2235]: "10"
        - button "crit Draw 7" [ref=e2236] [cursor=pointer]:
          - img [ref=e2237]
          - generic [ref=e2239]: Draw
          - generic [ref=e2240]: "7"
        - button "ok Removal 8" [ref=e2241] [cursor=pointer]:
          - img [ref=e2242]
          - generic [ref=e2244]: Removal
          - generic [ref=e2245]: "8"
        - button "crit Interaction 0" [ref=e2246] [cursor=pointer]:
          - img [ref=e2247]
          - generic [ref=e2249]: Interaction
          - generic [ref=e2250]: "0"
        - button "crit Finisher 0" [ref=e2251] [cursor=pointer]:
          - img [ref=e2252]
          - generic [ref=e2254]: Finisher
          - generic [ref=e2255]: "0"
        - button "crit Board Wipe 0" [ref=e2256] [cursor=pointer]:
          - img [ref=e2257]
          - generic [ref=e2259]: Board Wipe
          - generic [ref=e2260]: "0"
        - button "ok Recursion 4" [ref=e2261] [cursor=pointer]:
          - img [ref=e2262]
          - generic [ref=e2264]: Recursion
          - generic [ref=e2265]: "4"
        - button "crit Tutor 0" [ref=e2266] [cursor=pointer]:
          - img [ref=e2267]
          - generic [ref=e2269]: Tutor
          - generic [ref=e2270]: "0"
        - button "warn Protection 5" [ref=e2271] [cursor=pointer]:
          - img [ref=e2272]
          - generic [ref=e2274]: Protection
          - generic [ref=e2275]: "5"
        - generic [ref=e2276]:
          - img [ref=e2277]
          - text: Finisher is low (0 cards, target 4–6). Consider adding 4–6 more finisher effects.
  - region "Notifications alt+T"
  - alert [ref=e2279]
```

# Test source

```ts
  4   |  * Tests the core allocation engine: moving physical cards between decks,
  5   |  * verifying that status updates propagate correctly to both source and
  6   |  * target decks.
  7   |  *
  8   |  * These tests exercise the critical invariants:
  9   |  * - A physical copy can only be in one deck slot at a time
  10  |  * - Reassigning from Deck A to Deck B: Deck A loses the card (→ Open/Claimed), Deck B gains it (→ Original)
  11  |  * - Fill: assigns a free copy from the pool → slot becomes Original
  12  |  * - Claim: takes a copy from another deck → source deck's slot becomes Open
  13  |  * - Add Proxy: creates a new proxy copy → slot becomes Proxy
  14  |  * - Unassign: removes copy from slot → slot becomes Open, copy returns to pool
  15  |  * - Mark Missing: copy vanishes from its slot → slot becomes Open, copy flagged
  16  |  *
  17  |  * Prerequisites:
  18  |  *   - Auth session saved
  19  |  *   - At least 2 decks in "In Rotation" status with allocated cards
  20  |  *   - At least one card that exists in multiple decks (Claimed status)
  21  |  *
  22  |  * Run:
  23  |  *   npm run test:e2e -- tests/e2e/card-movement.spec.ts --headed
  24  |  */
  25  | 
  26  | import { test, expect, type Page } from '@playwright/test'
  27  | 
  28  | const LOAD_TIMEOUT = 30_000
  29  | const ACTION_TIMEOUT = 15_000
  30  | const SETTLE_TIMEOUT = 3000
  31  | 
  32  | // ═══════════════════════════════════════════════════════════════════════════════
  33  | // HELPERS
  34  | // ═══════════════════════════════════════════════════════════════════════════════
  35  | 
  36  | /** Navigate to a specific deck page and wait for cards to load */
  37  | async function navigateToDeck(page: Page, deckId: string) {
  38  |   await page.goto(`/decks/${deckId}`)
  39  |   await page.waitForURL(`**/decks/${deckId}`)
  40  |   await page.waitForTimeout(SETTLE_TIMEOUT)
  41  | }
  42  | 
  43  | /** Get the status text/badge for a specific card row */
  44  | async function getCardStatus(page: Page, cardName: string): Promise<string | null> {
  45  |   const row = page.locator(`text="${cardName}"`).first()
  46  |   if (!(await row.isVisible())) return null
  47  | 
  48  |   // Status chip is in the same row — look for aria-label with "status:"
  49  |   const parentRow = row.locator('..').locator('..')
  50  |   const chip = parentRow.locator('[aria-label*="status:"]').first()
  51  |   if (await chip.isVisible()) {
  52  |     return await chip.getAttribute('aria-label')
  53  |   }
  54  |   return null
  55  | }
  56  | 
  57  | /** Open the status chip popover for a card */
  58  | async function openCardPopover(page: Page, cardName: string) {
  59  |   const row = page.locator(`text="${cardName}"`).first()
  60  |   await expect(row).toBeVisible({ timeout: LOAD_TIMEOUT })
  61  |   const parentRow = row.locator('..').locator('..')
  62  |   const chip = parentRow.locator('[aria-label*="status:"]').first()
  63  |   await expect(chip).toBeVisible({ timeout: ACTION_TIMEOUT })
  64  |   await chip.click()
  65  |   await page.waitForTimeout(800)
  66  | }
  67  | 
  68  | /** Click an action button inside an open popover */
  69  | async function clickPopoverAction(page: Page, actionName: RegExp) {
  70  |   const popover = page.locator('[data-slot="popover-content"]').first()
  71  |   await expect(popover).toBeVisible({ timeout: ACTION_TIMEOUT })
  72  |   const btn = popover.getByRole('button', { name: actionName }).first()
  73  |   await expect(btn).toBeVisible({ timeout: 5000 })
  74  |   await btn.click()
  75  |   await page.waitForTimeout(SETTLE_TIMEOUT)
  76  | }
  77  | 
  78  | /** Count cards with a specific status in the filter bar */
  79  | async function getStatusCount(page: Page, statusName: string): Promise<number> {
  80  |   const chip = page.locator(`text=/${statusName} —/`).first()
  81  |   if (!(await chip.isVisible())) return 0
  82  |   const text = await chip.textContent()
  83  |   const match = text?.match(/— (\d+)/)
  84  |   return match ? parseInt(match[1], 10) : 0
  85  | }
  86  | 
  87  | // ═══════════════════════════════════════════════════════════════════════════════
  88  | // STATUS COUNTS — Verify counts update after actions
  89  | // ═══════════════════════════════════════════════════════════════════════════════
  90  | 
  91  | test.describe('Status Counts', () => {
  92  |   test('deck page shows status filter bar with counts', async ({ page }) => {
  93  |     await page.goto('/')
  94  |     await page.waitForTimeout(2000)
  95  | 
  96  |     // Navigate to first deck
  97  |     const deckLink = page.locator('a[href*="/decks/"]').first()
  98  |     await deckLink.click()
  99  |     await page.waitForURL('**/decks/**')
  100 |     await page.waitForTimeout(SETTLE_TIMEOUT)
  101 | 
  102 |     // Status filter bar should show at least "All" count
  103 |     const allChip = page.locator('text=/All —/').first()
> 104 |     await expect(allChip).toBeVisible({ timeout: LOAD_TIMEOUT })
      |                           ^ Error: expect(locator).toBeVisible() failed
  105 |   })
  106 | 
  107 |   test('status counts sum to total card count', async ({ page }) => {
  108 |     await page.goto('/')
  109 |     await page.waitForTimeout(2000)
  110 | 
  111 |     const deckLink = page.locator('a[href*="/decks/"]').first()
  112 |     await deckLink.click()
  113 |     await page.waitForURL('**/decks/**')
  114 |     await page.waitForTimeout(SETTLE_TIMEOUT)
  115 | 
  116 |     // Get the "All" count
  117 |     const allChip = page.locator('text=/All —/').first()
  118 |     await expect(allChip).toBeVisible({ timeout: LOAD_TIMEOUT })
  119 |     const allText = await allChip.textContent()
  120 |     const allCount = parseInt(allText?.match(/— (\d+)/)?.[1] ?? '0', 10)
  121 | 
  122 |     // Sum individual status counts
  123 |     const statuses = ['Original', 'Proxy', 'Open', 'Claimed', 'Unowned']
  124 |     let sum = 0
  125 |     for (const s of statuses) {
  126 |       sum += await getStatusCount(page, s)
  127 |     }
  128 | 
  129 |     // They should match (within tolerance — some statuses might not show if 0)
  130 |     // "All" may include statuses we don't enumerate; just check sum > 0
  131 |     expect(allCount).toBeGreaterThan(0)
  132 |     expect(sum).toBeGreaterThan(0)
  133 |   })
  134 | })
  135 | 
  136 | // ═══════════════════════════════════════════════════════════════════════════════
  137 | // FILL — Assign a free copy from the available pool
  138 | // ═══════════════════════════════════════════════════════════════════════════════
  139 | 
  140 | test.describe('Fill (Assign Free Copy)', () => {
  141 |   test('an Available/Open card shows Fill action in popover', async ({ page }) => {
  142 |     await page.goto('/')
  143 |     await page.waitForTimeout(2000)
  144 | 
  145 |     const deckLink = page.locator('a[href*="/decks/"]').first()
  146 |     await deckLink.click()
  147 |     await page.waitForURL('**/decks/**')
  148 |     await page.waitForTimeout(SETTLE_TIMEOUT)
  149 | 
  150 |     // Find an Open/Available status chip
  151 |     const openChip = page.locator('[aria-label*="status: available"], [aria-label*="status: open"]').first()
  152 |     if (await openChip.isVisible()) {
  153 |       await openChip.click()
  154 |       await page.waitForTimeout(800)
  155 | 
  156 |       // Popover should have a Fill/Assign action
  157 |       const popover = page.locator('[data-slot="popover-content"]').first()
  158 |       if (await popover.isVisible()) {
  159 |         const fillBtn = popover.getByRole('button', { name: /fill|assign|claim/i }).first()
  160 |         // If the card is truly available, fill button should be present
  161 |         expect(await fillBtn.isVisible() || await popover.getByText(/no copies/i).isVisible()).toBeTruthy()
  162 |       }
  163 |     }
  164 |   })
  165 | })
  166 | 
  167 | // ═══════════════════════════════════════════════════════════════════════════════
  168 | // REASSIGN — Move a card from one deck to another
  169 | // ═══════════════════════════════════════════════════════════════════════════════
  170 | 
  171 | test.describe('Reassign Between Decks', () => {
  172 |   test('Claimed card popover shows "Reassign" or deck name it belongs to', async ({ page }) => {
  173 |     await page.goto('/')
  174 |     await page.waitForTimeout(2000)
  175 | 
  176 |     const deckLink = page.locator('a[href*="/decks/"]').first()
  177 |     await deckLink.click()
  178 |     await page.waitForURL('**/decks/**')
  179 |     await page.waitForTimeout(SETTLE_TIMEOUT)
  180 | 
  181 |     // Find a Claimed status chip
  182 |     const claimedChip = page.locator('[aria-label*="status: claimed"]').first()
  183 |     if (await claimedChip.isVisible()) {
  184 |       await claimedChip.click()
  185 |       await page.waitForTimeout(800)
  186 | 
  187 |       const popover = page.locator('[data-slot="popover-content"]').first()
  188 |       await expect(popover).toBeVisible({ timeout: ACTION_TIMEOUT })
  189 | 
  190 |       // Should show which deck currently has the card, and offer to claim
  191 |       const popoverText = await popover.textContent()
  192 |       expect(popoverText).toBeTruthy()
  193 |       // Should mention the source deck or have a "Claim" action
  194 |       const hasClaimAction = await popover.getByRole('button', { name: /claim|take|reassign/i }).first().isVisible()
  195 |       const hasDeckInfo = (popoverText ?? '').length > 10 // Has some content
  196 |       expect(hasClaimAction || hasDeckInfo).toBeTruthy()
  197 |     }
  198 |   })
  199 | 
  200 |   test('claiming a card from another deck changes status to Original', async ({ page }) => {
  201 |     await page.goto('/')
  202 |     await page.waitForTimeout(2000)
  203 | 
  204 |     const deckLink = page.locator('a[href*="/decks/"]').first()
```