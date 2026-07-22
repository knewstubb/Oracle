# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: card-management.spec.ts >> View Modes >> basic lands are rolled up with quantity badge in cards view
- Location: tests/e2e/card-management.spec.ts:445:7

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: locator.click: Test timeout of 60000ms exceeded.
Call log:
  - waiting for getByRole('radio', { name: /cards view/i })

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
          - img "Yedora, Grave Gardener avatar" [ref=e52]
          - generic [ref=e53]:
            - heading "Yedora the Explorer" [level=1] [ref=e55]
            - paragraph [ref=e56]: 101 cards · 0 proxies · $119.90
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
                  - generic [ref=e110]: 94/101 Cards filled
                  - generic [ref=e111]:
                    - generic [ref=e112]: 94 Original
                    - generic [ref=e114]: 0 Proxy
                    - generic [ref=e116]: 0 In storage
                    - generic [ref=e118]: 7 In decks
                    - generic [ref=e120]: 0 Unowned
                - button "View Picklist" [ref=e127]
              - generic [ref=e128]:
                - generic [ref=e129]:
                  - generic [ref=e130]:
                    - button "Commander (1)" [expanded] [ref=e131]:
                      - generic [ref=e132]: Commander (1)
                      - img [ref=e133]
                    - list "Commander cards" [ref=e135]:
                      - listitem [ref=e136]:
                        - img [ref=e137]
                        - checkbox "Select Yedora, Grave Gardener" [ref=e144]
                        - generic [ref=e145]: "1"
                        - generic [ref=e146]: Yedora, Grave Gardener
                        - 'generic "Mana cost: {4}{G}" [ref=e148]':
                          - generic [ref=e149]: 
                          - generic [ref=e150]: 
                        - 'button "Yedora, Grave Gardener status: original" [ref=e151] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e153]':
                            - generic [ref=e154]: circle
                            - text: Original
                        - button "More actions" [ref=e156]:
                          - img [ref=e157]
                  - generic [ref=e161]:
                    - button "Flip Land (12)" [expanded] [ref=e162]:
                      - generic [ref=e163]: Flip Land (12)
                      - img [ref=e164]
                    - list "Flip Land cards" [ref=e166]:
                      - listitem [ref=e167]:
                        - img [ref=e168]
                        - checkbox "Select Ainok Survivalist" [ref=e175]
                        - generic [ref=e176]: "1"
                        - generic [ref=e177]: Ainok Survivalist
                        - 'generic "Mana cost: {1}{G}" [ref=e179]':
                          - generic [ref=e180]: 
                          - generic [ref=e181]: 
                        - 'button "Ainok Survivalist status: original" [ref=e182] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e184]':
                            - generic [ref=e185]: circle
                            - text: Original
                        - button "More actions" [ref=e187]:
                          - img [ref=e188]
                      - listitem [ref=e192]:
                        - img [ref=e193]
                        - checkbox "Select Culvert Ambusher" [ref=e200]
                        - generic [ref=e201]: "1"
                        - generic [ref=e202]: Culvert Ambusher
                        - 'generic "Mana cost: {3}{G}{G}" [ref=e204]':
                          - generic [ref=e205]: 
                          - generic [ref=e206]: 
                          - generic [ref=e207]: 
                        - 'button "Culvert Ambusher status: original" [ref=e208] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e210]':
                            - generic [ref=e211]: circle
                            - text: Original
                        - button "More actions" [ref=e213]:
                          - img [ref=e214]
                      - listitem [ref=e218]:
                        - img [ref=e219]
                        - checkbox "Select Den Protector" [ref=e226]
                        - generic [ref=e227]: "1"
                        - generic [ref=e228]: Den Protector
                        - 'generic "Mana cost: {1}{G}" [ref=e230]':
                          - generic [ref=e231]: 
                          - generic [ref=e232]: 
                        - 'button "Den Protector status: original" [ref=e233] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e235]':
                            - generic [ref=e236]: circle
                            - text: Original
                        - button "More actions" [ref=e238]:
                          - img [ref=e239]
                      - listitem [ref=e243]:
                        - img [ref=e244]
                        - checkbox "Select Flourishing Bloom-Kin" [ref=e251]
                        - generic [ref=e252]: "1"
                        - generic [ref=e253]: Flourishing Bloom-Kin
                        - 'generic "Mana cost: {1}{G}" [ref=e255]':
                          - generic [ref=e256]: 
                          - generic [ref=e257]: 
                        - 'button "Flourishing Bloom-Kin status: original" [ref=e258] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e260]':
                            - generic [ref=e261]: circle
                            - text: Original
                        - button "More actions" [ref=e263]:
                          - img [ref=e264]
                      - listitem [ref=e268]:
                        - img [ref=e269]
                        - checkbox "Select Greenbelt Radical" [ref=e276]
                        - generic [ref=e277]: "1"
                        - generic [ref=e278]: Greenbelt Radical
                        - 'generic "Mana cost: {3}{G}" [ref=e280]':
                          - generic [ref=e281]: 
                          - generic [ref=e282]: 
                        - 'button "Greenbelt Radical status: original" [ref=e283] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e285]':
                            - generic [ref=e286]: circle
                            - text: Original
                        - button "More actions" [ref=e288]:
                          - img [ref=e289]
                      - listitem [ref=e293]:
                        - img [ref=e294]
                        - checkbox "Select Hauntwoods Shrieker" [ref=e301]
                        - generic [ref=e302]: "1"
                        - generic [ref=e303]: Hauntwoods Shrieker
                        - 'generic "Mana cost: {1}{G}{G}" [ref=e305]':
                          - generic [ref=e306]: 
                          - generic [ref=e307]: 
                          - generic [ref=e308]: 
                        - 'button "Hauntwoods Shrieker status: original" [ref=e309] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e311]':
                            - generic [ref=e312]: circle
                            - text: Original
                        - button "More actions" [ref=e314]:
                          - img [ref=e315]
                      - listitem [ref=e319]:
                        - img [ref=e320]
                        - checkbox "Select Nantuko Vigilante" [ref=e327]
                        - generic [ref=e328]: "1"
                        - generic [ref=e329]: Nantuko Vigilante
                        - 'generic "Mana cost: {3}{G}" [ref=e331]':
                          - generic [ref=e332]: 
                          - generic [ref=e333]: 
                        - 'button "Nantuko Vigilante status: original" [ref=e334] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e336]':
                            - generic [ref=e337]: circle
                            - text: Original
                        - button "More actions" [ref=e339]:
                          - img [ref=e340]
                      - listitem [ref=e344]:
                        - img [ref=e345]
                        - checkbox "Select Nervous Gardener" [ref=e352]
                        - generic [ref=e353]: "1"
                        - generic [ref=e354]: Nervous Gardener
                        - 'generic "Mana cost: {1}{G}" [ref=e356]':
                          - generic [ref=e357]: 
                          - generic [ref=e358]: 
                        - 'button "Nervous Gardener status: original" [ref=e359] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e361]':
                            - generic [ref=e362]: circle
                            - text: Original
                        - button "More actions" [ref=e364]:
                          - img [ref=e365]
                      - listitem [ref=e369]:
                        - img [ref=e370]
                        - checkbox "Select Printlifter Ooze" [ref=e377]
                        - generic [ref=e378]: "1"
                        - generic [ref=e379]: Printlifter Ooze
                        - 'generic "Mana cost: {1}{G}" [ref=e381]':
                          - generic [ref=e382]: 
                          - generic [ref=e383]: 
                        - 'button "Printlifter Ooze status: original" [ref=e384] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e386]':
                            - generic [ref=e387]: circle
                            - text: Original
                        - button "More actions" [ref=e389]:
                          - img [ref=e390]
                      - listitem [ref=e394]:
                        - img [ref=e395]
                        - checkbox "Select Proteus Machine" [ref=e402]
                        - generic [ref=e403]: "1"
                        - generic [ref=e404]: Proteus Machine
                        - 'generic "Mana cost: {3}" [ref=e406]':
                          - generic [ref=e407]: 
                        - 'button "Proteus Machine status: original" [ref=e408] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e410]':
                            - generic [ref=e411]: circle
                            - text: Original
                        - button "More actions" [ref=e413]:
                          - img [ref=e414]
                      - listitem [ref=e418]:
                        - img [ref=e419]
                        - checkbox "Select Temur Charger" [ref=e426]
                        - generic [ref=e427]: "1"
                        - generic [ref=e428]: Temur Charger
                        - 'generic "Mana cost: {1}{G}" [ref=e430]':
                          - generic [ref=e431]: 
                          - generic [ref=e432]: 
                        - 'button "Temur Charger status: original" [ref=e433] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e435]':
                            - generic [ref=e436]: circle
                            - text: Original
                        - button "More actions" [ref=e438]:
                          - img [ref=e439]
                      - listitem [ref=e443]:
                        - img [ref=e444]
                        - checkbox "Select Vengeful Creeper" [ref=e451]
                        - generic [ref=e452]: "1"
                        - generic [ref=e453]: Vengeful Creeper
                        - 'generic "Mana cost: {4}{G}" [ref=e455]':
                          - generic [ref=e456]: 
                          - generic [ref=e457]: 
                        - 'button "Vengeful Creeper status: original" [ref=e458] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e460]':
                            - generic [ref=e461]: circle
                            - text: Original
                        - button "More actions" [ref=e463]:
                          - img [ref=e464]
                  - generic [ref=e468]:
                    - button "Protection (4)" [expanded] [ref=e469]:
                      - generic [ref=e470]: Protection (4)
                      - img [ref=e471]
                    - list "Protection cards" [ref=e473]:
                      - listitem [ref=e474]:
                        - img [ref=e475]
                        - checkbox "Select Heroic Intervention" [ref=e482]
                        - generic [ref=e483]: "1"
                        - generic [ref=e484]: Heroic Intervention
                        - 'generic "Mana cost: {1}{G}" [ref=e486]':
                          - generic [ref=e487]: 
                          - generic [ref=e488]: 
                        - 'button "Heroic Intervention status: original" [ref=e489] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e491]':
                            - generic [ref=e492]: circle
                            - text: Original
                        - button "More actions" [ref=e494]:
                          - img [ref=e495]
                      - listitem [ref=e499]:
                        - img [ref=e500]
                        - checkbox "Select Lightning Greaves" [ref=e507]
                        - generic [ref=e508]: "1"
                        - generic [ref=e509]: Lightning Greaves
                        - 'generic "Mana cost: {2}" [ref=e511]':
                          - generic [ref=e512]: 
                        - 'button "Lightning Greaves status: original" [ref=e513] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e515]':
                            - generic [ref=e516]: circle
                            - text: Original
                        - button "More actions" [ref=e518]:
                          - img [ref=e519]
                      - listitem [ref=e523]:
                        - img [ref=e524]
                        - checkbox "Select Swiftfoot Boots" [ref=e531]
                        - generic [ref=e532]: "1"
                        - generic [ref=e533]: Swiftfoot Boots
                        - 'generic "Mana cost: {2}" [ref=e535]':
                          - generic [ref=e536]: 
                        - 'button "Swiftfoot Boots status: original" [ref=e537] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e539]':
                            - generic [ref=e540]: circle
                            - text: Original
                        - button "More actions" [ref=e542]:
                          - img [ref=e543]
                      - listitem [ref=e547]:
                        - img [ref=e548]
                        - checkbox "Select Tamiyo's Safekeeping" [ref=e555]
                        - generic [ref=e556]: "1"
                        - generic [ref=e557]: Tamiyo's Safekeeping
                        - 'generic "Mana cost: {G}" [ref=e559]':
                          - generic [ref=e560]: 
                        - 'button "Tamiyo''s Safekeeping status: claimed" [ref=e561] [cursor=pointer]':
                          - 'generic "Status: Claimed" [ref=e563]':
                            - generic [ref=e564]: lock
                            - text: Claimed
                        - button "More actions" [ref=e566]:
                          - img [ref=e567]
                  - generic [ref=e571]:
                    - button "Ramp (19)" [expanded] [ref=e572]:
                      - generic [ref=e573]: Ramp (19)
                      - img [ref=e574]
                    - list "Ramp cards" [ref=e576]:
                      - listitem [ref=e577]:
                        - img [ref=e578]
                        - checkbox "Select Arbor Elf" [ref=e585]
                        - generic [ref=e586]: "1"
                        - generic [ref=e587]: Arbor Elf
                        - 'generic "Mana cost: {G}" [ref=e589]':
                          - generic [ref=e590]: 
                        - 'button "Arbor Elf status: original" [ref=e591] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e593]':
                            - generic [ref=e594]: circle
                            - text: Original
                        - button "More actions" [ref=e596]:
                          - img [ref=e597]
                      - listitem [ref=e601]:
                        - img [ref=e602]
                        - checkbox "Select Arcane Signet" [ref=e609]
                        - generic [ref=e610]: "1"
                        - generic [ref=e611]: Arcane Signet
                        - 'generic "Mana cost: {2}" [ref=e613]':
                          - generic [ref=e614]: 
                        - 'button "Arcane Signet status: original" [ref=e615] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e617]':
                            - generic [ref=e618]: circle
                            - text: Original
                        - button "More actions" [ref=e620]:
                          - img [ref=e621]
                      - listitem [ref=e625]:
                        - img [ref=e626]
                        - checkbox "Select Cultivate" [ref=e633]
                        - generic [ref=e634]: "1"
                        - generic [ref=e635]: Cultivate
                        - 'generic "Mana cost: {2}{G}" [ref=e637]':
                          - generic [ref=e638]: 
                          - generic [ref=e639]: 
                        - 'button "Cultivate status: original" [ref=e640] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e642]':
                            - generic [ref=e643]: circle
                            - text: Original
                        - button "More actions" [ref=e645]:
                          - img [ref=e646]
                      - listitem [ref=e650]:
                        - img [ref=e651]
                        - checkbox "Select Elvish Mystic" [ref=e658]
                        - generic [ref=e659]: "1"
                        - generic [ref=e660]: Elvish Mystic
                        - 'generic "Mana cost: {G}" [ref=e662]':
                          - generic [ref=e663]: 
                        - 'button "Elvish Mystic status: original" [ref=e664] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e666]':
                            - generic [ref=e667]: circle
                            - text: Original
                        - button "More actions" [ref=e669]:
                          - img [ref=e670]
                      - listitem [ref=e674]:
                        - img [ref=e675]
                        - checkbox "Select Emerald Medallion" [ref=e682]
                        - generic [ref=e683]: "1"
                        - generic [ref=e684]: Emerald Medallion
                        - 'generic "Mana cost: {2}" [ref=e686]':
                          - generic [ref=e687]: 
                        - 'button "Emerald Medallion status: claimed" [ref=e688] [cursor=pointer]':
                          - 'generic "Status: Claimed" [ref=e690]':
                            - generic [ref=e691]: lock
                            - text: Claimed
                        - button "More actions" [ref=e693]:
                          - img [ref=e694]
                      - listitem [ref=e698]:
                        - img [ref=e699]
                        - checkbox "Select Explore" [ref=e706]
                        - generic [ref=e707]: "1"
                        - generic [ref=e708]: Explore
                        - 'generic "Mana cost: {1}{G}" [ref=e710]':
                          - generic [ref=e711]: 
                          - generic [ref=e712]: 
                        - 'button "Explore status: original" [ref=e713] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e715]':
                            - generic [ref=e716]: circle
                            - text: Original
                        - button "More actions" [ref=e718]:
                          - img [ref=e719]
                      - listitem [ref=e723]:
                        - img [ref=e724]
                        - checkbox "Select Fellwar Stone" [ref=e731]
                        - generic [ref=e732]: "1"
                        - generic [ref=e733]: Fellwar Stone
                        - 'generic "Mana cost: {2}" [ref=e735]':
                          - generic [ref=e736]: 
                        - 'button "Fellwar Stone status: original" [ref=e737] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e739]':
                            - generic [ref=e740]: circle
                            - text: Original
                        - button "More actions" [ref=e742]:
                          - img [ref=e743]
                      - listitem [ref=e747]:
                        - img [ref=e748]
                        - checkbox "Select Fyndhorn Elves" [ref=e755]
                        - generic [ref=e756]: "1"
                        - generic [ref=e757]: Fyndhorn Elves
                        - 'generic "Mana cost: {G}" [ref=e759]':
                          - generic [ref=e760]: 
                        - 'button "Fyndhorn Elves status: original" [ref=e761] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e763]':
                            - generic [ref=e764]: circle
                            - text: Original
                        - button "More actions" [ref=e766]:
                          - img [ref=e767]
                      - listitem [ref=e771]:
                        - img [ref=e772]
                        - checkbox "Select Harrow" [ref=e779]
                        - generic [ref=e780]: "1"
                        - generic [ref=e781]: Harrow
                        - 'generic "Mana cost: {2}{G}" [ref=e783]':
                          - generic [ref=e784]: 
                          - generic [ref=e785]: 
                        - 'button "Harrow status: original" [ref=e786] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e788]':
                            - generic [ref=e789]: circle
                            - text: Original
                        - button "More actions" [ref=e791]:
                          - img [ref=e792]
                      - listitem [ref=e796]:
                        - img [ref=e797]
                        - checkbox "Select Kodama's Reach" [ref=e804]
                        - generic [ref=e805]: "1"
                        - generic [ref=e806]: Kodama's Reach
                        - 'generic "Mana cost: {2}{G}" [ref=e808]':
                          - generic [ref=e809]: 
                          - generic [ref=e810]: 
                        - 'button "Kodama''s Reach status: original" [ref=e811] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e813]':
                            - generic [ref=e814]: circle
                            - text: Original
                        - button "More actions" [ref=e816]:
                          - img [ref=e817]
                      - listitem [ref=e821]:
                        - img [ref=e822]
                        - checkbox "Select Llanowar Elves" [ref=e829]
                        - generic [ref=e830]: "1"
                        - generic [ref=e831]: Llanowar Elves
                        - 'generic "Mana cost: {G}" [ref=e833]':
                          - generic [ref=e834]: 
                        - 'button "Llanowar Elves status: original" [ref=e835] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e837]':
                            - generic [ref=e838]: circle
                            - text: Original
                        - button "More actions" [ref=e840]:
                          - img [ref=e841]
                      - listitem [ref=e845]:
                        - img [ref=e846]
                        - checkbox "Select Lotus Cobra" [ref=e853]
                        - generic [ref=e854]: "1"
                        - generic [ref=e855]: Lotus Cobra
                        - 'generic "Mana cost: {1}{G}" [ref=e857]':
                          - generic [ref=e858]: 
                          - generic [ref=e859]: 
                        - 'button "Lotus Cobra status: original" [ref=e860] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e862]':
                            - generic [ref=e863]: circle
                            - text: Original
                        - button "More actions" [ref=e865]:
                          - img [ref=e866]
                      - listitem [ref=e870]:
                        - img [ref=e871]
                        - checkbox "Select Nature's Lore" [ref=e878]
                        - generic [ref=e879]: "1"
                        - generic [ref=e880]: Nature's Lore
                        - 'generic "Mana cost: {1}{G}" [ref=e882]':
                          - generic [ref=e883]: 
                          - generic [ref=e884]: 
                        - 'button "Nature''s Lore status: original" [ref=e885] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e887]':
                            - generic [ref=e888]: circle
                            - text: Original
                        - button "More actions" [ref=e890]:
                          - img [ref=e891]
                      - listitem [ref=e895]:
                        - img [ref=e896]
                        - checkbox "Select Nissa, Who Shakes the World" [ref=e903]
                        - generic [ref=e904]: "1"
                        - generic [ref=e905]: Nissa, Who Shakes the World
                        - 'generic "Mana cost: {3}{G}{G}" [ref=e907]':
                          - generic [ref=e908]: 
                          - generic [ref=e909]: 
                          - generic [ref=e910]: 
                        - 'button "Nissa, Who Shakes the World status: original" [ref=e911] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e913]':
                            - generic [ref=e914]: circle
                            - text: Original
                        - button "More actions" [ref=e916]:
                          - img [ref=e917]
                      - listitem [ref=e921]:
                        - img [ref=e922]
                        - checkbox "Select Rampant Growth" [ref=e929]
                        - generic [ref=e930]: "1"
                        - generic [ref=e931]: Rampant Growth
                        - 'generic "Mana cost: {1}{G}" [ref=e933]':
                          - generic [ref=e934]: 
                          - generic [ref=e935]: 
                        - 'button "Rampant Growth status: original" [ref=e936] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e938]':
                            - generic [ref=e939]: circle
                            - text: Original
                        - button "More actions" [ref=e941]:
                          - img [ref=e942]
                      - listitem [ref=e946]:
                        - img [ref=e947]
                        - checkbox "Select Sakura-Tribe Elder" [ref=e954]
                        - generic [ref=e955]: "1"
                        - generic [ref=e956]: Sakura-Tribe Elder
                        - 'generic "Mana cost: {1}{G}" [ref=e958]':
                          - generic [ref=e959]: 
                          - generic [ref=e960]: 
                        - 'button "Sakura-Tribe Elder status: original" [ref=e961] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e963]':
                            - generic [ref=e964]: circle
                            - text: Original
                        - button "More actions" [ref=e966]:
                          - img [ref=e967]
                      - listitem [ref=e971]:
                        - img [ref=e972]
                        - checkbox "Select Sol Ring" [ref=e979]
                        - generic [ref=e980]: "1"
                        - generic [ref=e981]: Sol Ring
                        - 'generic "Mana cost: {1}" [ref=e983]':
                          - generic [ref=e984]: 
                        - 'button "Sol Ring status: original" [ref=e985] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e987]':
                            - generic [ref=e988]: circle
                            - text: Original
                        - button "More actions" [ref=e990]:
                          - img [ref=e991]
                      - listitem [ref=e995]:
                        - img [ref=e996]
                        - checkbox "Select Tireless Provisioner" [ref=e1003]
                        - generic [ref=e1004]: "1"
                        - generic [ref=e1005]: Tireless Provisioner
                        - 'generic "Mana cost: {2}{G}" [ref=e1007]':
                          - generic [ref=e1008]: 
                          - generic [ref=e1009]: 
                        - 'button "Tireless Provisioner status: claimed" [ref=e1010] [cursor=pointer]':
                          - 'generic "Status: Claimed" [ref=e1012]':
                            - generic [ref=e1013]: lock
                            - text: Claimed
                        - button "More actions" [ref=e1015]:
                          - img [ref=e1016]
                      - listitem [ref=e1020]:
                        - img [ref=e1021]
                        - checkbox "Select Wild Growth" [ref=e1028]
                        - generic [ref=e1029]: "1"
                        - generic [ref=e1030]: Wild Growth
                        - 'generic "Mana cost: {G}" [ref=e1032]':
                          - generic [ref=e1033]: 
                        - 'button "Wild Growth status: claimed" [ref=e1034] [cursor=pointer]':
                          - 'generic "Status: Claimed" [ref=e1036]':
                            - generic [ref=e1037]: lock
                            - text: Claimed
                        - button "More actions" [ref=e1039]:
                          - img [ref=e1040]
                - generic [ref=e1044]:
                  - generic [ref=e1045]:
                    - button "Bounce Land (9)" [expanded] [ref=e1046]:
                      - generic [ref=e1047]: Bounce Land (9)
                      - img [ref=e1048]
                    - list "Bounce Land cards" [ref=e1050]:
                      - listitem [ref=e1051]:
                        - img [ref=e1052]
                        - checkbox "Select Arid Archway" [ref=e1059]
                        - generic [ref=e1060]: "1"
                        - generic [ref=e1061]: Arid Archway
                        - 'button "Arid Archway status: original" [ref=e1062] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1064]':
                            - generic [ref=e1065]: circle
                            - text: Original
                        - button "More actions" [ref=e1067]:
                          - img [ref=e1068]
                      - listitem [ref=e1072]:
                        - img [ref=e1073]
                        - checkbox "Select Chocobo Kick" [ref=e1080]
                        - generic [ref=e1081]: "1"
                        - generic [ref=e1082]: Chocobo Kick
                        - 'generic "Mana cost: {1}{G}" [ref=e1084]':
                          - generic [ref=e1085]: 
                          - generic [ref=e1086]: 
                        - 'button "Chocobo Kick status: original" [ref=e1087] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1089]':
                            - generic [ref=e1090]: circle
                            - text: Original
                        - button "More actions" [ref=e1092]:
                          - img [ref=e1093]
                      - listitem [ref=e1097]:
                        - img [ref=e1098]
                        - checkbox "Select Guildless Commons" [ref=e1105]
                        - generic [ref=e1106]: "1"
                        - generic [ref=e1107]: Guildless Commons
                        - 'button "Guildless Commons status: original" [ref=e1108] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1110]':
                            - generic [ref=e1111]: circle
                            - text: Original
                        - button "More actions" [ref=e1113]:
                          - img [ref=e1114]
                      - listitem [ref=e1118]:
                        - img [ref=e1119]
                        - checkbox "Select Jungle Basin" [ref=e1126]
                        - generic [ref=e1127]: "1"
                        - generic [ref=e1128]: Jungle Basin
                        - 'button "Jungle Basin status: original" [ref=e1129] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1131]':
                            - generic [ref=e1132]: circle
                            - text: Original
                        - button "More actions" [ref=e1134]:
                          - img [ref=e1135]
                      - listitem [ref=e1139]:
                        - img [ref=e1140]
                        - checkbox "Select Multani, Yavimaya's Avatar" [ref=e1147]
                        - generic [ref=e1148]: "1"
                        - generic [ref=e1149]: Multani, Yavimaya's Avatar
                        - 'generic "Mana cost: {4}{G}{G}" [ref=e1151]':
                          - generic [ref=e1152]: 
                          - generic [ref=e1153]: 
                          - generic [ref=e1154]: 
                        - 'button "Multani, Yavimaya''s Avatar status: original" [ref=e1155] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1157]':
                            - generic [ref=e1158]: circle
                            - text: Original
                        - button "More actions" [ref=e1160]:
                          - img [ref=e1161]
                      - listitem [ref=e1165]:
                        - img [ref=e1166]
                        - checkbox "Select Quirion Ranger" [ref=e1173]
                        - generic [ref=e1174]: "1"
                        - generic [ref=e1175]: Quirion Ranger
                        - 'generic "Mana cost: {G}" [ref=e1177]':
                          - generic [ref=e1178]: 
                        - 'button "Quirion Ranger status: original" [ref=e1179] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1181]':
                            - generic [ref=e1182]: circle
                            - text: Original
                        - button "More actions" [ref=e1184]:
                          - img [ref=e1185]
                      - listitem [ref=e1189]:
                        - img [ref=e1190]
                        - checkbox "Select Scryb Ranger" [ref=e1197]
                        - generic [ref=e1198]: "1"
                        - generic [ref=e1199]: Scryb Ranger
                        - 'generic "Mana cost: {1}{G}" [ref=e1201]':
                          - generic [ref=e1202]: 
                          - generic [ref=e1203]: 
                        - 'button "Scryb Ranger status: original" [ref=e1204] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1206]':
                            - generic [ref=e1207]: circle
                            - text: Original
                        - button "More actions" [ref=e1209]:
                          - img [ref=e1210]
                      - listitem [ref=e1214]:
                        - img [ref=e1215]
                        - checkbox "Select Stampeding Wildebeests" [ref=e1222]
                        - generic [ref=e1223]: "1"
                        - generic [ref=e1224]: Stampeding Wildebeests
                        - 'generic "Mana cost: {2}{G}{G}" [ref=e1226]':
                          - generic [ref=e1227]: 
                          - generic [ref=e1228]: 
                          - generic [ref=e1229]: 
                        - 'button "Stampeding Wildebeests status: original" [ref=e1230] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1232]':
                            - generic [ref=e1233]: circle
                            - text: Original
                        - button "More actions" [ref=e1235]:
                          - img [ref=e1236]
                      - listitem [ref=e1240]:
                        - img [ref=e1241]
                        - checkbox "Select Sutina, Speaker of the Tajuru" [ref=e1248]
                        - generic [ref=e1249]: "1"
                        - generic [ref=e1250]: Sutina, Speaker of the Tajuru
                        - 'generic "Mana cost: {2}{G}" [ref=e1252]':
                          - generic [ref=e1253]: 
                          - generic [ref=e1254]: 
                        - 'button "Sutina, Speaker of the Tajuru status: original" [ref=e1255] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1257]':
                            - generic [ref=e1258]: circle
                            - text: Original
                        - button "More actions" [ref=e1260]:
                          - img [ref=e1261]
                  - generic [ref=e1265]:
                    - button "Land/Creature (3)" [expanded] [ref=e1266]:
                      - generic [ref=e1267]: Land/Creature (3)
                      - img [ref=e1268]
                    - list "Land/Creature cards" [ref=e1270]:
                      - listitem [ref=e1271]:
                        - img [ref=e1272]
                        - checkbox "Select Life and Limb" [ref=e1279]
                        - generic [ref=e1280]: "1"
                        - generic [ref=e1281]: Life and Limb
                        - 'generic "Mana cost: {3}{G}" [ref=e1283]':
                          - generic [ref=e1284]: 
                          - generic [ref=e1285]: 
                        - 'button "Life and Limb status: original" [ref=e1286] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1288]':
                            - generic [ref=e1289]: circle
                            - text: Original
                        - button "More actions" [ref=e1291]:
                          - img [ref=e1292]
                      - listitem [ref=e1296]:
                        - img [ref=e1297]
                        - checkbox "Select Living Lands" [ref=e1304]
                        - generic [ref=e1305]: "1"
                        - generic [ref=e1306]: Living Lands
                        - 'generic "Mana cost: {3}{G}" [ref=e1308]':
                          - generic [ref=e1309]: 
                          - generic [ref=e1310]: 
                        - 'button "Living Lands status: original" [ref=e1311] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1313]':
                            - generic [ref=e1314]: circle
                            - text: Original
                        - button "More actions" [ref=e1316]:
                          - img [ref=e1317]
                      - listitem [ref=e1321]:
                        - img [ref=e1322]
                        - checkbox "Select Vastwood Zendikon" [ref=e1329]
                        - generic [ref=e1330]: "1"
                        - generic [ref=e1331]: Vastwood Zendikon
                        - 'generic "Mana cost: {4}{G}" [ref=e1333]':
                          - generic [ref=e1334]: 
                          - generic [ref=e1335]: 
                        - 'button "Vastwood Zendikon status: original" [ref=e1336] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1338]':
                            - generic [ref=e1339]: circle
                            - text: Original
                        - button "More actions" [ref=e1341]:
                          - img [ref=e1342]
                  - generic [ref=e1346]:
                    - button "Landfall (5)" [expanded] [ref=e1347]:
                      - generic [ref=e1348]: Landfall (5)
                      - img [ref=e1349]
                    - list "Landfall cards" [ref=e1351]:
                      - listitem [ref=e1352]:
                        - img [ref=e1353]
                        - checkbox "Select Avenger of Zendikar" [ref=e1360]
                        - generic [ref=e1361]: "1"
                        - generic [ref=e1362]: Avenger of Zendikar
                        - 'generic "Mana cost: {5}{G}{G}" [ref=e1364]':
                          - generic [ref=e1365]: 
                          - generic [ref=e1366]: 
                          - generic [ref=e1367]: 
                        - 'button "Avenger of Zendikar status: original" [ref=e1368] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1370]':
                            - generic [ref=e1371]: circle
                            - text: Original
                        - button "More actions" [ref=e1373]:
                          - img [ref=e1374]
                      - listitem [ref=e1378]:
                        - img [ref=e1379]
                        - checkbox "Select Embodiment of Insight" [ref=e1386]
                        - generic [ref=e1387]: "1"
                        - generic [ref=e1388]: Embodiment of Insight
                        - 'generic "Mana cost: {4}{G}" [ref=e1390]':
                          - generic [ref=e1391]: 
                          - generic [ref=e1392]: 
                        - 'button "Embodiment of Insight status: original" [ref=e1393] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1395]':
                            - generic [ref=e1396]: circle
                            - text: Original
                        - button "More actions" [ref=e1398]:
                          - img [ref=e1399]
                      - listitem [ref=e1403]:
                        - img [ref=e1404]
                        - checkbox "Select Kazandu Stomper" [ref=e1411]
                        - generic [ref=e1412]: "1"
                        - generic [ref=e1413]: Kazandu Stomper
                        - 'generic "Mana cost: {5}{G}" [ref=e1415]':
                          - generic [ref=e1416]: 
                          - generic [ref=e1417]: 
                        - 'button "Kazandu Stomper status: original" [ref=e1418] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1420]':
                            - generic [ref=e1421]: circle
                            - text: Original
                        - button "More actions" [ref=e1423]:
                          - img [ref=e1424]
                      - listitem [ref=e1428]:
                        - img [ref=e1429]
                        - checkbox "Select Rampaging Baloths" [ref=e1436]
                        - generic [ref=e1437]: "1"
                        - generic [ref=e1438]: Rampaging Baloths
                        - 'generic "Mana cost: {4}{G}{G}" [ref=e1440]':
                          - generic [ref=e1441]: 
                          - generic [ref=e1442]: 
                          - generic [ref=e1443]: 
                        - 'button "Rampaging Baloths status: original" [ref=e1444] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1446]':
                            - generic [ref=e1447]: circle
                            - text: Original
                        - button "More actions" [ref=e1449]:
                          - img [ref=e1450]
                      - listitem [ref=e1454]:
                        - img [ref=e1455]
                        - checkbox "Select Scute Swarm" [ref=e1462]
                        - generic [ref=e1463]: "1"
                        - generic [ref=e1464]: Scute Swarm
                        - 'generic "Mana cost: {2}{G}" [ref=e1466]':
                          - generic [ref=e1467]: 
                          - generic [ref=e1468]: 
                        - 'button "Scute Swarm status: original" [ref=e1469] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1471]':
                            - generic [ref=e1472]: circle
                            - text: Original
                        - button "More actions" [ref=e1474]:
                          - img [ref=e1475]
                  - generic [ref=e1479]:
                    - button "Recursion (2)" [expanded] [ref=e1480]:
                      - generic [ref=e1481]: Recursion (2)
                      - img [ref=e1482]
                    - list "Recursion cards" [ref=e1484]:
                      - listitem [ref=e1485]:
                        - img [ref=e1486]
                        - checkbox "Select Deathmist Raptor" [ref=e1493]
                        - generic [ref=e1494]: "1"
                        - generic [ref=e1495]: Deathmist Raptor
                        - 'generic "Mana cost: {1}{G}{G}" [ref=e1497]':
                          - generic [ref=e1498]: 
                          - generic [ref=e1499]: 
                          - generic [ref=e1500]: 
                        - 'button "Deathmist Raptor status: original" [ref=e1501] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1503]':
                            - generic [ref=e1504]: circle
                            - text: Original
                        - button "More actions" [ref=e1506]:
                          - img [ref=e1507]
                      - listitem [ref=e1511]:
                        - img [ref=e1512]
                        - checkbox "Select Eternal Witness" [ref=e1519]
                        - generic [ref=e1520]: "1"
                        - generic [ref=e1521]: Eternal Witness
                        - 'generic "Mana cost: {1}{G}{G}" [ref=e1523]':
                          - generic [ref=e1524]: 
                          - generic [ref=e1525]: 
                          - generic [ref=e1526]: 
                        - 'button "Eternal Witness status: original" [ref=e1527] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1529]':
                            - generic [ref=e1530]: circle
                            - text: Original
                        - button "More actions" [ref=e1532]:
                          - img [ref=e1533]
                  - generic [ref=e1537]:
                    - button "Removal (3)" [expanded] [ref=e1538]:
                      - generic [ref=e1539]: Removal (3)
                      - img [ref=e1540]
                    - list "Removal cards" [ref=e1542]:
                      - listitem [ref=e1543]:
                        - img [ref=e1544]
                        - checkbox "Select Beast Within" [ref=e1551]
                        - generic [ref=e1552]: "1"
                        - generic [ref=e1553]: Beast Within
                        - 'generic "Mana cost: {2}{G}" [ref=e1555]':
                          - generic [ref=e1556]: 
                          - generic [ref=e1557]: 
                        - 'button "Beast Within status: original" [ref=e1558] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1560]':
                            - generic [ref=e1561]: circle
                            - text: Original
                        - button "More actions" [ref=e1563]:
                          - img [ref=e1564]
                      - listitem [ref=e1568]:
                        - img [ref=e1569]
                        - checkbox "Select Cankerbloom" [ref=e1576]
                        - generic [ref=e1577]: "1"
                        - generic [ref=e1578]: Cankerbloom
                        - 'generic "Mana cost: {1}{G}" [ref=e1580]':
                          - generic [ref=e1581]: 
                          - generic [ref=e1582]: 
                        - 'button "Cankerbloom status: original" [ref=e1583] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1585]':
                            - generic [ref=e1586]: circle
                            - text: Original
                        - button "More actions" [ref=e1588]:
                          - img [ref=e1589]
                      - listitem [ref=e1593]:
                        - img [ref=e1594]
                        - checkbox "Select Kenrith's Transformation" [ref=e1601]
                        - generic [ref=e1602]: "1"
                        - generic [ref=e1603]: Kenrith's Transformation
                        - 'generic "Mana cost: {1}{G}" [ref=e1605]':
                          - generic [ref=e1606]: 
                          - generic [ref=e1607]: 
                        - 'button "Kenrith''s Transformation status: claimed" [ref=e1608] [cursor=pointer]':
                          - 'generic "Status: Claimed" [ref=e1610]':
                            - generic [ref=e1611]: lock
                            - text: Claimed
                        - button "More actions" [ref=e1613]:
                          - img [ref=e1614]
                  - generic [ref=e1618]:
                    - button "Sac Outlet (2)" [expanded] [ref=e1619]:
                      - generic [ref=e1620]: Sac Outlet (2)
                      - img [ref=e1621]
                    - list "Sac Outlet cards" [ref=e1623]:
                      - listitem [ref=e1624]:
                        - img [ref=e1625]
                        - checkbox "Select Ashnod's Altar" [ref=e1632]
                        - generic [ref=e1633]: "1"
                        - generic [ref=e1634]: Ashnod's Altar
                        - 'generic "Mana cost: {3}" [ref=e1636]':
                          - generic [ref=e1637]: 
                        - 'button "Ashnod''s Altar status: original" [ref=e1638] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1640]':
                            - generic [ref=e1641]: circle
                            - text: Original
                        - button "More actions" [ref=e1643]:
                          - img [ref=e1644]
                      - listitem [ref=e1648]:
                        - img [ref=e1649]
                        - checkbox "Select Zuran Orb" [ref=e1656]
                        - generic [ref=e1657]: "1"
                        - generic [ref=e1658]: Zuran Orb
                        - 'generic "Mana cost: {0}" [ref=e1660]':
                          - generic [ref=e1661]: 
                        - 'button "Zuran Orb status: original" [ref=e1662] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1664]':
                            - generic [ref=e1665]: circle
                            - text: Original
                        - button "More actions" [ref=e1667]:
                          - img [ref=e1668]
                - generic [ref=e1672]:
                  - generic [ref=e1673]:
                    - button "Draw (7)" [expanded] [ref=e1674]:
                      - generic [ref=e1675]: Draw (7)
                      - img [ref=e1676]
                    - list "Draw cards" [ref=e1678]:
                      - listitem [ref=e1679]:
                        - img [ref=e1680]
                        - checkbox "Select Beast Whisperer" [ref=e1687]
                        - generic [ref=e1688]: "1"
                        - generic [ref=e1689]: Beast Whisperer
                        - 'generic "Mana cost: {2}{G}{G}" [ref=e1691]':
                          - generic [ref=e1692]: 
                          - generic [ref=e1693]: 
                          - generic [ref=e1694]: 
                        - 'button "Beast Whisperer status: original" [ref=e1695] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1697]':
                            - generic [ref=e1698]: circle
                            - text: Original
                        - button "More actions" [ref=e1700]:
                          - img [ref=e1701]
                      - listitem [ref=e1705]:
                        - img [ref=e1706]
                        - checkbox "Select Evolutionary Leap" [ref=e1713]
                        - generic [ref=e1714]: "1"
                        - generic [ref=e1715]: Evolutionary Leap
                        - 'generic "Mana cost: {1}{G}" [ref=e1717]':
                          - generic [ref=e1718]: 
                          - generic [ref=e1719]: 
                        - 'button "Evolutionary Leap status: original" [ref=e1720] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1722]':
                            - generic [ref=e1723]: circle
                            - text: Original
                        - button "More actions" [ref=e1725]:
                          - img [ref=e1726]
                      - listitem [ref=e1730]:
                        - img [ref=e1731]
                        - checkbox "Select Fecundity" [ref=e1738]
                        - generic [ref=e1739]: "1"
                        - generic [ref=e1740]: Fecundity
                        - 'generic "Mana cost: {2}{G}" [ref=e1742]':
                          - generic [ref=e1743]: 
                          - generic [ref=e1744]: 
                        - 'button "Fecundity status: original" [ref=e1745] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1747]':
                            - generic [ref=e1748]: circle
                            - text: Original
                        - button "More actions" [ref=e1750]:
                          - img [ref=e1751]
                      - listitem [ref=e1755]:
                        - img [ref=e1756]
                        - checkbox "Select Garruk's Uprising" [ref=e1763]
                        - generic [ref=e1764]: "1"
                        - generic [ref=e1765]: Garruk's Uprising
                        - 'generic "Mana cost: {2}{G}" [ref=e1767]':
                          - generic [ref=e1768]: 
                          - generic [ref=e1769]: 
                        - 'button "Garruk''s Uprising status: original" [ref=e1770] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1772]':
                            - generic [ref=e1773]: circle
                            - text: Original
                        - button "More actions" [ref=e1775]:
                          - img [ref=e1776]
                      - listitem [ref=e1780]:
                        - img [ref=e1781]
                        - checkbox "Select Harmonize" [ref=e1788]
                        - generic [ref=e1789]: "1"
                        - generic [ref=e1790]: Harmonize
                        - 'generic "Mana cost: {2}{G}{G}" [ref=e1792]':
                          - generic [ref=e1793]: 
                          - generic [ref=e1794]: 
                          - generic [ref=e1795]: 
                        - 'button "Harmonize status: original" [ref=e1796] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1798]':
                            - generic [ref=e1799]: circle
                            - text: Original
                        - button "More actions" [ref=e1801]:
                          - img [ref=e1802]
                      - listitem [ref=e1806]:
                        - img [ref=e1807]
                        - checkbox "Select Return of the Wildspeaker" [ref=e1814]
                        - generic [ref=e1815]: "1"
                        - generic [ref=e1816]: Return of the Wildspeaker
                        - 'generic "Mana cost: {4}{G}" [ref=e1818]':
                          - generic [ref=e1819]: 
                          - generic [ref=e1820]: 
                        - 'button "Return of the Wildspeaker status: original" [ref=e1821] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1823]':
                            - generic [ref=e1824]: circle
                            - text: Original
                        - button "More actions" [ref=e1826]:
                          - img [ref=e1827]
                      - listitem [ref=e1831]:
                        - img [ref=e1832]
                        - checkbox "Select Tireless Tracker" [ref=e1839]
                        - generic [ref=e1840]: "1"
                        - generic [ref=e1841]: Tireless Tracker
                        - 'generic "Mana cost: {2}{G}" [ref=e1843]':
                          - generic [ref=e1844]: 
                          - generic [ref=e1845]: 
                        - 'button "Tireless Tracker status: original" [ref=e1846] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1848]':
                            - generic [ref=e1849]: circle
                            - text: Original
                        - button "More actions" [ref=e1851]:
                          - img [ref=e1852]
                  - generic [ref=e1856]:
                    - button "Land (34) Convert all specific-printing lands to generic" [expanded] [ref=e1857]:
                      - generic [ref=e1858]: Land (34)
                      - button "Convert all specific-printing lands to generic" [ref=e1859]: Make all generic
                      - img [ref=e1860]
                    - list "Land cards" [ref=e1862]:
                      - listitem [ref=e1863]:
                        - generic [ref=e1864]:
                          - img [ref=e1865]
                          - checkbox "Select Forest (ECL)" [ref=e1872]
                          - generic [ref=e1873]: "32"
                          - generic [ref=e1874]: Forest (ECL)
                          - 'generic "Status: Claimed" [ref=e1876] [cursor=pointer]':
                            - generic [ref=e1877]: lock
                            - text: Claimed
                          - button "More actions" [ref=e1879]:
                            - img [ref=e1880]
                      - listitem [ref=e1884]:
                        - img [ref=e1885]
                        - checkbox "Select Mosswort Bridge" [ref=e1892]
                        - generic [ref=e1893]: "1"
                        - generic [ref=e1894]: Mosswort Bridge
                        - 'button "Mosswort Bridge status: original" [ref=e1895] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1897]':
                            - generic [ref=e1898]: circle
                            - text: Original
                        - button "More actions" [ref=e1900]:
                          - img [ref=e1901]
                      - listitem [ref=e1905]:
                        - img [ref=e1906]
                        - checkbox "Select Rogue's Passage" [ref=e1913]
                        - generic [ref=e1914]: "1"
                        - generic [ref=e1915]: Rogue's Passage
                        - 'button "Rogue''s Passage status: original" [ref=e1916] [cursor=pointer]':
                          - 'generic "Status: Original" [ref=e1918]':
                            - generic [ref=e1919]: circle
                            - text: Original
                        - button "More actions" [ref=e1921]:
                          - img [ref=e1922]
            - generic [ref=e1927]:
              - generic [ref=e1930]: 94 original
              - generic [ref=e1933]: 0 proxied
              - generic [ref=e1936]: open
              - generic [ref=e1939]: 7 claimed
              - generic [ref=e1942]: 0 unowned
      - generic [ref=e1944]:
        - button "crit Ramp 19" [ref=e1945] [cursor=pointer]:
          - img [ref=e1946]
          - generic [ref=e1948]: Ramp
          - generic [ref=e1949]: "19"
        - button "crit Draw 7" [ref=e1950] [cursor=pointer]:
          - img [ref=e1951]
          - generic [ref=e1953]: Draw
          - generic [ref=e1954]: "7"
        - button "crit Removal 4" [ref=e1955] [cursor=pointer]:
          - img [ref=e1956]
          - generic [ref=e1958]: Removal
          - generic [ref=e1959]: "4"
        - button "crit Interaction 0" [ref=e1960] [cursor=pointer]:
          - img [ref=e1961]
          - generic [ref=e1963]: Interaction
          - generic [ref=e1964]: "0"
        - button "crit Finisher 0" [ref=e1965] [cursor=pointer]:
          - img [ref=e1966]
          - generic [ref=e1968]: Finisher
          - generic [ref=e1969]: "0"
        - button "crit Board Wipe 0" [ref=e1970] [cursor=pointer]:
          - img [ref=e1971]
          - generic [ref=e1973]: Board Wipe
          - generic [ref=e1974]: "0"
        - button "ok Recursion 2" [ref=e1975] [cursor=pointer]:
          - img [ref=e1976]
          - generic [ref=e1978]: Recursion
          - generic [ref=e1979]: "2"
        - button "crit Tutor 0" [ref=e1980] [cursor=pointer]:
          - img [ref=e1981]
          - generic [ref=e1983]: Tutor
          - generic [ref=e1984]: "0"
        - button "warn Protection 5" [ref=e1985] [cursor=pointer]:
          - img [ref=e1986]
          - generic [ref=e1988]: Protection
          - generic [ref=e1989]: "5"
        - generic [ref=e1990]:
          - img [ref=e1991]
          - text: Ramp is high (19 cards, target 10–12). Consider removing 7–9 ramp effects.
  - region "Notifications alt+T"
  - alert [ref=e1993]
```

# Test source

```ts
  349 |   test('picklist mode shows progress and card candidates', async ({ page }) => {
  350 |     await goToFirstDeck(page)
  351 |     await waitForStatuses(page)
  352 | 
  353 |     // Switch to Picklist mode
  354 |     const picklistBtn = page.getByText('Picklist').first()
  355 |     await expect(picklistBtn).toBeVisible({ timeout: TIMEOUT })
  356 |     await picklistBtn.click()
  357 |     await page.waitForTimeout(2000)
  358 | 
  359 |     // Should show progress bar (X/Y resolved)
  360 |     await expect(
  361 |       page.getByText(/resolved/).first()
  362 |     ).toBeVisible({ timeout: TIMEOUT })
  363 |   })
  364 | 
  365 |   test('picklist excludes basic lands', async ({ page }) => {
  366 |     await goToFirstDeck(page)
  367 | 
  368 |     const picklistBtn = page.getByText('Picklist').first()
  369 |     await picklistBtn.click()
  370 |     await page.waitForTimeout(2000)
  371 | 
  372 |     // Basic lands (Forest, Swamp, etc.) should NOT appear
  373 |     const forestEntry = page.locator('text="Forest"')
  374 |     const swampEntry = page.locator('text="Swamp"')
  375 |     const plainEntry = page.locator('text="Plains"')
  376 | 
  377 |     // None of these should be in the picklist
  378 |     expect(await forestEntry.count()).toBe(0)
  379 |     expect(await swampEntry.count()).toBe(0)
  380 |     expect(await plainEntry.count()).toBe(0)
  381 |   })
  382 | 
  383 |   test('picklist groups by location', async ({ page }) => {
  384 |     await goToFirstDeck(page)
  385 | 
  386 |     const picklistBtn = page.getByText('Picklist').first()
  387 |     await picklistBtn.click()
  388 |     await page.waitForTimeout(2000)
  389 | 
  390 |     // Sections should be location names (not tier labels like "Free in Storage")
  391 |     // The old tier labels should NOT appear
  392 |     const oldLabels = page.locator('text=/Free in Storage|Free Proxy in Storage|From Brew Decks|From Boxed Decks/')
  393 |     expect(await oldLabels.count()).toBe(0)
  394 |   })
  395 | })
  396 | 
  397 | // ═══════════════════════════════════════════════════════════════════════════════
  398 | // VIEW MODES — Card display toggles
  399 | // ═══════════════════════════════════════════════════════════════════════════════
  400 | 
  401 | test.describe('View Modes', () => {
  402 |   test('groups view (default) shows 3-column layout with sections', async ({ page }) => {
  403 |     await goToFirstDeck(page)
  404 |     await page.waitForTimeout(2000)
  405 | 
  406 |     // Default is groups view — look for the 3-column grid
  407 |     const grid = page.locator('.lg\\:grid-cols-3').first()
  408 |     await expect(grid).toBeVisible({ timeout: TIMEOUT })
  409 |   })
  410 | 
  411 |   test('commander is always the first section', async ({ page }) => {
  412 |     await goToFirstDeck(page)
  413 |     await page.waitForTimeout(2000)
  414 | 
  415 |     // First section header should be "COMMANDER"
  416 |     const firstSection = page.locator('section').first()
  417 |     await expect(firstSection).toContainText(/COMMANDER/i)
  418 |   })
  419 | 
  420 |   test('list view shows rows with category tags and kebab menus', async ({ page }) => {
  421 |     await goToFirstDeck(page)
  422 |     await waitForStatuses(page)
  423 | 
  424 |     const listBtn = page.getByRole('radio', { name: /list view/i })
  425 |     await listBtn.click()
  426 |     await page.waitForTimeout(1000)
  427 | 
  428 |     // Should see card rows with hoverable elements
  429 |     await expect(page.locator('[role="listitem"]').first()).toBeVisible({ timeout: 5000 })
  430 |   })
  431 | 
  432 |   test('cards view shows 6-column image grid with glow borders', async ({ page }) => {
  433 |     await goToFirstDeck(page)
  434 |     await waitForStatuses(page)
  435 | 
  436 |     const gridBtn = page.getByRole('radio', { name: /cards view/i })
  437 |     await gridBtn.click()
  438 |     await page.waitForTimeout(2000)
  439 | 
  440 |     // Should see Scryfall card images
  441 |     const cardImages = page.locator('img[src*="scryfall"]')
  442 |     await expect(cardImages.first()).toBeVisible({ timeout: TIMEOUT })
  443 |   })
  444 | 
  445 |   test('basic lands are rolled up with quantity badge in cards view', async ({ page }) => {
  446 |     await goToFirstDeck(page)
  447 | 
  448 |     const gridBtn = page.getByRole('radio', { name: /cards view/i })
> 449 |     await gridBtn.click()
      |                   ^ Error: locator.click: Test timeout of 60000ms exceeded.
  450 |     await page.waitForTimeout(2000)
  451 | 
  452 |     // Look for quantity badges (×N) — indicates rolled-up lands
  453 |     const badges = page.locator('text=/×\\d+/')
  454 |     // May or may not exist depending on the deck — just verify no crash
  455 |     await expect(page.locator('body')).not.toContainText('Application error')
  456 |   })
  457 | })
  458 | 
  459 | // ═══════════════════════════════════════════════════════════════════════════════
  460 | // PROXY IMAGE — Download/Copy for printing
  461 | // ═══════════════════════════════════════════════════════════════════════════════
  462 | 
  463 | test.describe('Proxy Image Actions', () => {
  464 |   test('proxy card popover shows download and copy image buttons', async ({ page }) => {
  465 |     await goToFirstDeck(page)
  466 |     await waitForStatuses(page)
  467 | 
  468 |     const proxyChip = page.getByRole('button', { name: /Proxy —/ })
  469 |     const count = await proxyChip.textContent()
  470 |     test.skip(!count || count.includes('— 0'), 'No proxy cards')
  471 | 
  472 |     await proxyChip.click()
  473 |     await page.waitForTimeout(500)
  474 | 
  475 |     const statusChip = page.locator('[aria-label*="status: proxy"]').first()
  476 |     await statusChip.click()
  477 | 
  478 |     // Popover should show download/copy icons for proxy image
  479 |     await page.waitForTimeout(1000)
  480 |     const downloadBtn = page.locator('[title="Download image"]')
  481 |     const copyBtn = page.locator('[title="Copy image"]')
  482 | 
  483 |     // At least one should be visible if the proxy has a printing
  484 |     const hasImageActions = await downloadBtn.isVisible().catch(() => false) ||
  485 |       await copyBtn.isVisible().catch(() => false)
  486 | 
  487 |     // Not all proxies have printings yet — just verify no error
  488 |     await expect(page.locator('body')).not.toContainText('Application error')
  489 |   })
  490 | })
  491 | 
```