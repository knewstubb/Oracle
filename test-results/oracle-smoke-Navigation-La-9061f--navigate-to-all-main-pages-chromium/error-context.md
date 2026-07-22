# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: oracle-smoke.spec.ts >> Navigation & Layout >> can navigate to all main pages
- Location: tests/e2e/oracle-smoke.spec.ts:40:7

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: locator.click: Test timeout of 60000ms exceeded.
Call log:
  - waiting for getByText('Storage')

```

# Page snapshot

```yaml
- generic [ref=e1]:
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
      - link "Collection" [active] [ref=e16] [cursor=pointer]:
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
      - generic [ref=e47]:
        - generic [ref=e48]:
          - heading "Collection" [level=1] [ref=e49]
          - paragraph [ref=e50]: 0 owned · Prices cached
        - generic [ref=e51]:
          - button "Export" [ref=e52]:
            - img
            - generic [ref=e53]: Export
          - button "Import CSV" [ref=e55]:
            - img
            - text: Import CSV
      - generic [ref=e56]:
        - generic [ref=e57]:
          - generic [ref=e58]: Collection Value
          - generic [ref=e59]: $1,875.55
        - generic [ref=e60]:
          - generic [ref=e61]: Cards
          - text: 3,542
        - generic [ref=e62]:
          - generic [ref=e63]: Most Valuable
          - generic [ref=e64]: Urborg, Tomb of Yawgmoth · $61.55
        - button "Refresh Prices" [ref=e66]:
          - img [ref=e67]
          - generic [ref=e72]: Refresh Prices
      - generic [ref=e73]:
        - generic [ref=e76]:
          - generic [ref=e77]:
            - generic [ref=e78]:
              - img
              - textbox "Search cards by name" [ref=e79]:
                - /placeholder: Search cards...
            - generic [ref=e80]:
              - combobox "Sort by field" [ref=e81]:
                - option "Date Updated"
                - option "Date Added"
                - option "Quantity"
                - option "Card Name" [selected]
                - option "Rarity"
                - option "Price"
              - img
            - 'button "Sort direction: ascending" [ref=e82]':
              - img [ref=e83]
            - generic [ref=e87]:
              - button "List view" [ref=e88]:
                - img [ref=e89]
              - button "Grid view" [pressed] [ref=e92]:
                - img [ref=e93]
          - generic [ref=e98]:
            - group "Color identity filter" [ref=e99]:
              - button "White" [ref=e100]:
                - img [ref=e101]
              - button "Blue" [ref=e104]:
                - img [ref=e105]
              - button "Black" [ref=e107]:
                - img [ref=e108]
              - button "Red" [ref=e112]:
                - img [ref=e113]
              - button "Green" [ref=e115]:
                - img [ref=e116]
              - button "Colorless" [ref=e118]:
                - img [ref=e119]
              - radiogroup "Color filter mode" [ref=e121]:
                - radio "Exact" [checked] [ref=e122]
                - radio "Includes" [ref=e123]
            - group "Status filter" [ref=e125]:
              - button "Fully Placed" [ref=e126]
              - button "Partially Available" [ref=e127]
              - button "Unplaced" [ref=e128]
              - button "Over-Allocated" [ref=e129]
        - list "Collection card grid" [ref=e132]:
          - listitem [ref=e133]:
            - generic [ref=e134]:
              - button "A.I.M. Scientists — tap to expand printing details" [ref=e135] [cursor=pointer]:
                - img "A.I.M. Scientists" [ref=e137]
                - img [ref=e139]
              - generic [ref=e141]:
                - generic "A.I.M. Scientists" [ref=e142]
                - generic [ref=e143]:
                  - generic [ref=e144]: "Owned: 1"
                  - generic [ref=e145]: "Used: 0"
                - generic [ref=e146]: —
          - listitem [ref=e147]:
            - generic [ref=e148]:
              - button "Aang, at the Crossroads // Aang, Destined Savior — tap to expand printing details" [ref=e149] [cursor=pointer]:
                - img "Aang, at the Crossroads // Aang, Destined Savior" [ref=e151]
                - img [ref=e153]
              - generic [ref=e155]:
                - generic "Aang, at the Crossroads // Aang, Destined Savior" [ref=e156]
                - generic [ref=e157]:
                  - generic [ref=e158]: "Owned: 2"
                  - generic [ref=e159]: "Used: 0"
                - generic [ref=e160]: —
          - listitem [ref=e161]:
            - generic [ref=e162]:
              - button "Aang, Swift Savior // Aang and La, Ocean's Fury — tap to expand printing details" [ref=e163] [cursor=pointer]:
                - img "Aang, Swift Savior // Aang and La, Ocean's Fury" [ref=e165]
                - img [ref=e167]
              - generic [ref=e169]:
                - generic "Aang, Swift Savior // Aang and La, Ocean's Fury" [ref=e170]
                - generic [ref=e171]:
                  - generic [ref=e172]: "Owned: 2"
                  - generic [ref=e173]: "Used: 0"
                - generic [ref=e174]: —
          - listitem [ref=e175]:
            - generic [ref=e176]:
              - button "Aang, the Last Airbender — tap to expand printing details" [ref=e177] [cursor=pointer]:
                - img "Aang, the Last Airbender" [ref=e179]
                - img [ref=e181]
              - generic [ref=e183]:
                - generic "Aang, the Last Airbender" [ref=e184]
                - generic [ref=e185]:
                  - generic [ref=e186]: "Owned: 2"
                  - generic [ref=e187]: "Used: 0"
                - generic [ref=e188]: —
          - listitem [ref=e189]:
            - generic [ref=e190]:
              - button "Aberrant Return — tap to expand printing details" [ref=e191] [cursor=pointer]:
                - img "Aberrant Return" [ref=e193]
                - img [ref=e195]
              - generic [ref=e197]:
                - generic "Aberrant Return" [ref=e198]
                - generic [ref=e199]:
                  - generic [ref=e200]: "Owned: 1"
                  - generic [ref=e201]: "Used: 0"
                - generic [ref=e202]: —
          - listitem [ref=e203]:
            - generic [ref=e204]:
              - button "Abrade — tap to expand printing details" [ref=e205] [cursor=pointer]:
                - img "Abrade" [ref=e207]
                - img [ref=e209]
              - generic [ref=e211]:
                - generic "Abrade" [ref=e212]
                - generic [ref=e213]:
                  - generic [ref=e214]: "Owned: 7"
                  - generic [ref=e215]: "Used: 0"
                - generic [ref=e216]: —
          - listitem [ref=e217]:
            - generic [ref=e218]:
              - button "Absorbing Man — tap to expand printing details" [ref=e219] [cursor=pointer]:
                - img "Absorbing Man" [ref=e221]
                - img [ref=e223]
              - generic [ref=e225]:
                - generic "Absorbing Man" [ref=e226]
                - generic [ref=e227]:
                  - generic [ref=e228]: "Owned: 1"
                  - generic [ref=e229]: "Used: 0"
                - generic [ref=e230]: —
          - listitem [ref=e231]:
            - generic [ref=e232]:
              - button "Abundant Harvest — tap to expand printing details" [ref=e233] [cursor=pointer]:
                - img "Abundant Harvest" [ref=e235]
                - img [ref=e237]
              - generic [ref=e239]:
                - generic "Abundant Harvest" [ref=e240]
                - generic [ref=e241]:
                  - generic [ref=e242]: "Owned: 1"
                  - generic [ref=e243]: "Used: 0"
                - generic [ref=e244]: —
          - listitem [ref=e245]:
            - generic [ref=e246]:
              - button "Abzan Devotee — tap to expand printing details" [ref=e247] [cursor=pointer]:
                - img "Abzan Devotee" [ref=e249]
                - img [ref=e251]
              - generic [ref=e253]:
                - generic "Abzan Devotee" [ref=e254]
                - generic [ref=e255]:
                  - generic [ref=e256]: "Owned: 1"
                  - generic [ref=e257]: "Used: 0"
                - generic [ref=e258]: —
          - listitem [ref=e259]:
            - generic [ref=e260]:
              - button "Academy Ruins — tap to expand printing details" [ref=e261] [cursor=pointer]:
                - img "Academy Ruins" [ref=e263]
                - img [ref=e265]
              - generic [ref=e267]:
                - generic "Academy Ruins" [ref=e268]
                - generic [ref=e269]:
                  - generic [ref=e270]: "Owned: 1"
                  - generic [ref=e271]: "Used: 0"
                - generic [ref=e272]: —
          - listitem [ref=e273]:
            - generic [ref=e274]:
              - button "Accomplished Automaton — tap to expand printing details" [ref=e275] [cursor=pointer]:
                - img "Accomplished Automaton" [ref=e277]
                - img [ref=e279]
              - generic [ref=e281]:
                - generic "Accomplished Automaton" [ref=e282]
                - generic [ref=e283]:
                  - generic [ref=e284]: "Owned: 1"
                  - generic [ref=e285]: "Used: 0"
                - generic [ref=e286]: —
          - listitem [ref=e287]:
            - generic [ref=e288]:
              - button "Accorder's Shield — tap to expand printing details" [ref=e289] [cursor=pointer]:
                - img "Accorder's Shield" [ref=e291]
                - img [ref=e293]
              - generic [ref=e295]:
                - generic "Accorder's Shield" [ref=e296]
                - generic [ref=e297]:
                  - generic [ref=e298]: "Owned: 1"
                  - generic [ref=e299]: "Used: 0"
                - generic [ref=e300]: —
          - listitem [ref=e301]:
            - generic [ref=e302]:
              - button "Accumulate Wisdom — tap to expand printing details" [ref=e303] [cursor=pointer]:
                - img "Accumulate Wisdom" [ref=e305]
                - img [ref=e307]
              - generic [ref=e309]:
                - generic "Accumulate Wisdom" [ref=e310]
                - generic [ref=e311]:
                  - generic [ref=e312]: "Owned: 2"
                  - generic [ref=e313]: "Used: 0"
                - generic [ref=e314]: —
          - listitem [ref=e315]:
            - generic [ref=e316]:
              - button "Accursed Marauder — tap to expand printing details" [ref=e317] [cursor=pointer]:
                - img "Accursed Marauder" [ref=e319]
                - img [ref=e321]
              - generic [ref=e323]:
                - generic "Accursed Marauder" [ref=e324]
                - generic [ref=e325]:
                  - generic [ref=e326]: "Owned: 1"
                  - generic [ref=e327]: "Used: 1"
                - generic [ref=e328]: —
          - listitem [ref=e329]:
            - generic [ref=e330]:
              - button "Acererak the Archlich — tap to expand printing details" [ref=e331] [cursor=pointer]:
                - img "Acererak the Archlich" [ref=e333]
                - img [ref=e335]
              - generic [ref=e337]:
                - generic "Acererak the Archlich" [ref=e338]
                - generic [ref=e339]:
                  - generic [ref=e340]: "Owned: 1"
                  - generic [ref=e341]: "Used: 0"
                - generic [ref=e342]: —
          - listitem [ref=e343]:
            - generic [ref=e344]:
              - button "Acidic Slime — tap to expand printing details" [ref=e345] [cursor=pointer]:
                - img "Acidic Slime" [ref=e347]
                - img [ref=e349]
              - generic [ref=e351]:
                - generic "Acidic Slime" [ref=e352]
                - generic [ref=e353]:
                  - generic [ref=e354]: "Owned: 1"
                  - generic [ref=e355]: "Used: 1"
                - generic [ref=e356]: —
          - listitem [ref=e357]:
            - generic [ref=e358]:
              - button "Acidic Sliver — tap to expand printing details" [ref=e359] [cursor=pointer]:
                - img "Acidic Sliver" [ref=e361]
                - img [ref=e363]
              - generic [ref=e365]:
                - generic "Acidic Sliver" [ref=e366]
                - generic [ref=e367]:
                  - generic [ref=e368]: "Owned: 1"
                  - generic [ref=e369]: "Used: 0"
                - generic [ref=e370]: —
          - listitem [ref=e371]:
            - generic [ref=e372]:
              - button "Adarkar Wastes — tap to expand printing details" [ref=e373] [cursor=pointer]:
                - img "Adarkar Wastes" [ref=e375]
                - img [ref=e377]
              - generic [ref=e379]:
                - generic "Adarkar Wastes" [ref=e380]
                - generic [ref=e381]:
                  - generic [ref=e382]: "Owned: 1"
                  - generic [ref=e383]: "Used: 0"
                - generic [ref=e384]: —
          - listitem [ref=e385]:
            - generic [ref=e386]:
              - button "Adeline, Resplendent Cathar — tap to expand printing details" [ref=e387] [cursor=pointer]:
                - img "Adeline, Resplendent Cathar" [ref=e389]
                - img [ref=e391]
              - generic [ref=e393]:
                - generic "Adeline, Resplendent Cathar" [ref=e394]
                - generic [ref=e395]:
                  - generic [ref=e396]: "Owned: 1"
                  - generic [ref=e397]: "Used: 0"
                - generic [ref=e398]: —
          - listitem [ref=e399]:
            - generic [ref=e400]:
              - button "Adorned Crocodile — tap to expand printing details" [ref=e401] [cursor=pointer]:
                - img "Adorned Crocodile" [ref=e403]
                - img [ref=e405]
              - generic [ref=e407]:
                - generic "Adorned Crocodile" [ref=e408]
                - generic [ref=e409]:
                  - generic [ref=e410]: "Owned: 1"
                  - generic [ref=e411]: "Used: 0"
                - generic [ref=e412]: —
          - listitem [ref=e413]:
            - generic [ref=e414]:
              - button "Adventurer's Inn — tap to expand printing details" [ref=e415] [cursor=pointer]:
                - img "Adventurer's Inn" [ref=e417]
                - img [ref=e419]
              - generic [ref=e421]:
                - generic "Adventurer's Inn" [ref=e422]
                - generic [ref=e423]:
                  - generic [ref=e424]: "Owned: 1"
                  - generic [ref=e425]: "Used: 0"
                - generic [ref=e426]: —
          - listitem [ref=e427]:
            - generic [ref=e428]:
              - button "Adventurous Eater // Have a Bite — tap to expand printing details" [ref=e429] [cursor=pointer]:
                - img "Adventurous Eater // Have a Bite" [ref=e431]
                - img [ref=e433]
              - generic [ref=e435]:
                - generic "Adventurous Eater // Have a Bite" [ref=e436]
                - generic [ref=e437]:
                  - generic [ref=e438]: "Owned: 2"
                  - generic [ref=e439]: "Used: 0"
                - generic [ref=e440]: —
          - listitem [ref=e441]:
            - generic [ref=e442]:
              - button "Aegis Turtle — tap to expand printing details" [ref=e443] [cursor=pointer]:
                - img "Aegis Turtle" [ref=e445]
                - img [ref=e447]
              - generic [ref=e449]:
                - generic "Aegis Turtle" [ref=e450]
                - generic [ref=e451]:
                  - generic [ref=e452]: "Owned: 2"
                  - generic [ref=e453]: "Used: 0"
                - generic [ref=e454]: —
          - listitem [ref=e455]:
            - generic [ref=e456]:
              - button "Aether Adept — tap to expand printing details" [ref=e457] [cursor=pointer]:
                - img "Aether Adept" [ref=e459]
                - img [ref=e461]
              - generic [ref=e463]:
                - generic "Aether Adept" [ref=e464]
                - generic [ref=e465]:
                  - generic [ref=e466]: "Owned: 1"
                  - generic [ref=e467]: "Used: 0"
                - generic [ref=e468]: —
          - listitem [ref=e469]:
            - generic [ref=e470]:
              - button "Aether Snap — tap to expand printing details" [ref=e471] [cursor=pointer]:
                - img "Aether Snap" [ref=e473]
                - img [ref=e475]
              - generic [ref=e477]:
                - generic "Aether Snap" [ref=e478]
                - generic [ref=e479]:
                  - generic [ref=e480]: "Owned: 1"
                  - generic [ref=e481]: "Used: 1"
                - generic [ref=e482]: —
          - listitem [ref=e483]:
            - generic [ref=e484]:
              - button "Aether Spellbomb — tap to expand printing details" [ref=e485] [cursor=pointer]:
                - img "Aether Spellbomb" [ref=e487]
                - img [ref=e489]
              - generic [ref=e491]:
                - generic "Aether Spellbomb" [ref=e492]
                - generic [ref=e493]:
                  - generic [ref=e494]: "Owned: 1"
                  - generic [ref=e495]: "Used: 0"
                - generic [ref=e496]: —
          - listitem [ref=e497]:
            - generic [ref=e498]:
              - button "Aetherize — tap to expand printing details" [ref=e499] [cursor=pointer]:
                - img "Aetherize" [ref=e501]
                - img [ref=e503]
              - generic [ref=e505]:
                - generic "Aetherize" [ref=e506]
                - generic [ref=e507]:
                  - generic [ref=e508]: "Owned: 2"
                  - generic [ref=e509]: "Used: 0"
                - generic [ref=e510]: —
          - listitem [ref=e511]:
            - generic [ref=e512]:
              - button "Aftermath Analyst — tap to expand printing details" [ref=e513] [cursor=pointer]:
                - img "Aftermath Analyst" [ref=e515]
                - img [ref=e517]
              - generic [ref=e519]:
                - generic "Aftermath Analyst" [ref=e520]
                - generic [ref=e521]:
                  - generic [ref=e522]: "Owned: 1"
                  - generic [ref=e523]: "Used: 1"
                - generic [ref=e524]: —
          - listitem [ref=e525]:
            - generic [ref=e526]:
              - button "Agate Instigator — tap to expand printing details" [ref=e527] [cursor=pointer]:
                - img "Agate Instigator" [ref=e529]
                - img [ref=e531]
              - generic [ref=e533]:
                - generic "Agate Instigator" [ref=e534]
                - generic [ref=e535]:
                  - generic [ref=e536]: "Owned: 1"
                  - generic [ref=e537]: "Used: 0"
                - generic [ref=e538]: —
          - listitem [ref=e539]:
            - generic [ref=e540]:
              - button "Agents of S.H.I.E.L.D. — tap to expand printing details" [ref=e541] [cursor=pointer]:
                - img "Agents of S.H.I.E.L.D." [ref=e543]
                - img [ref=e545]
              - generic [ref=e547]:
                - generic "Agents of S.H.I.E.L.D." [ref=e548]
                - generic [ref=e549]:
                  - generic [ref=e550]: "Owned: 2"
                  - generic [ref=e551]: "Used: 0"
                - generic [ref=e552]: —
          - listitem [ref=e553]:
            - generic [ref=e554]:
              - button "Agitator Ant — tap to expand printing details" [ref=e555] [cursor=pointer]:
                - img "Agitator Ant" [ref=e557]
                - img [ref=e559]
              - generic [ref=e561]:
                - generic "Agitator Ant" [ref=e562]
                - generic [ref=e563]:
                  - generic [ref=e564]: "Owned: 2"
                  - generic [ref=e565]: "Used: 1"
                - generic [ref=e566]: —
          - listitem [ref=e567]:
            - generic [ref=e568]:
              - button "Ahn-Crop Crasher — tap to expand printing details" [ref=e569] [cursor=pointer]:
                - img "Ahn-Crop Crasher" [ref=e571]
                - img [ref=e573]
              - generic [ref=e575]:
                - generic "Ahn-Crop Crasher" [ref=e576]
                - generic [ref=e577]:
                  - generic [ref=e578]: "Owned: 1"
                  - generic [ref=e579]: "Used: 0"
                - generic [ref=e580]: —
          - listitem [ref=e581]:
            - generic [ref=e582]:
              - button "Ainok Strike Leader — tap to expand printing details" [ref=e583] [cursor=pointer]:
                - img "Ainok Strike Leader" [ref=e585]
                - img [ref=e587]
              - generic [ref=e589]:
                - generic "Ainok Strike Leader" [ref=e590]
                - generic [ref=e591]:
                  - generic [ref=e592]: "Owned: 1"
                  - generic [ref=e593]: "Used: 0"
                - generic [ref=e594]: —
          - listitem [ref=e595]:
            - generic [ref=e596]:
              - button "Ainok Survivalist — tap to expand printing details" [ref=e597] [cursor=pointer]:
                - img "Ainok Survivalist" [ref=e599]
                - img [ref=e601]
              - generic [ref=e603]:
                - generic "Ainok Survivalist" [ref=e604]
                - generic [ref=e605]:
                  - generic [ref=e606]: "Owned: 1"
                  - generic [ref=e607]: "Used: 1"
                - generic [ref=e608]: —
          - listitem [ref=e609]:
            - generic [ref=e610]:
              - button "Ainok Wayfarer — tap to expand printing details" [ref=e611] [cursor=pointer]:
                - img "Ainok Wayfarer" [ref=e613]
                - img [ref=e615]
              - generic [ref=e617]:
                - generic "Ainok Wayfarer" [ref=e618]
                - generic [ref=e619]:
                  - generic [ref=e620]: "Owned: 1"
                  - generic [ref=e621]: "Used: 0"
                - generic [ref=e622]: —
          - listitem [ref=e623]:
            - generic [ref=e624]:
              - button "Ajani, Caller of the Pride — tap to expand printing details" [ref=e625] [cursor=pointer]:
                - img "Ajani, Caller of the Pride" [ref=e627]
                - img [ref=e629]
              - generic [ref=e631]:
                - generic "Ajani, Caller of the Pride" [ref=e632]
                - generic [ref=e633]:
                  - generic [ref=e634]: "Owned: 1"
                  - generic [ref=e635]: "Used: 0"
                - generic [ref=e636]: —
          - listitem [ref=e637]:
            - generic [ref=e638]:
              - button "Ajani's Response — tap to expand printing details" [ref=e639] [cursor=pointer]:
                - img "Ajani's Response" [ref=e641]
                - img [ref=e643]
              - generic [ref=e645]:
                - generic "Ajani's Response" [ref=e646]
                - generic [ref=e647]:
                  - generic [ref=e648]: "Owned: 1"
                  - generic [ref=e649]: "Used: 0"
                - generic [ref=e650]: —
          - listitem [ref=e651]:
            - generic [ref=e652]:
              - button "Akki Battle Squad — tap to expand printing details" [ref=e653] [cursor=pointer]:
                - img "Akki Battle Squad" [ref=e655]
                - img [ref=e657]
              - generic [ref=e659]:
                - generic "Akki Battle Squad" [ref=e660]
                - generic [ref=e661]:
                  - generic [ref=e662]: "Owned: 1"
                  - generic [ref=e663]: "Used: 1"
                - generic [ref=e664]: —
          - listitem [ref=e665]:
            - generic [ref=e666]:
              - button "Akoum Refuge — tap to expand printing details" [ref=e667] [cursor=pointer]:
                - img "Akoum Refuge" [ref=e669]
                - img [ref=e671]
              - generic [ref=e673]:
                - generic "Akoum Refuge" [ref=e674]
                - generic [ref=e675]:
                  - generic [ref=e676]: "Owned: 1"
                  - generic [ref=e677]: "Used: 0"
                - generic [ref=e678]: —
          - listitem [ref=e679]:
            - generic [ref=e680]:
              - button "Akroma's Will — tap to expand printing details" [ref=e681] [cursor=pointer]:
                - img "Akroma's Will" [ref=e683]
                - img [ref=e685]
              - generic [ref=e687]:
                - generic "Akroma's Will" [ref=e688]
                - generic [ref=e689]:
                  - generic [ref=e690]: "Owned: 1"
                  - generic [ref=e691]: "Used: 0"
                - generic [ref=e692]: —
          - listitem [ref=e693]:
            - generic [ref=e694]:
              - button "Alchemist's Refuge — tap to expand printing details" [ref=e695] [cursor=pointer]:
                - img "Alchemist's Refuge" [ref=e697]
                - img [ref=e699]
              - generic [ref=e701]:
                - generic "Alchemist's Refuge" [ref=e702]
                - generic [ref=e703]:
                  - generic [ref=e704]: "Owned: 1"
                  - generic [ref=e705]: "Used: 0"
                - generic [ref=e706]: —
          - listitem [ref=e707]:
            - generic [ref=e708]:
              - button "All-Fates Stalker — tap to expand printing details" [ref=e709] [cursor=pointer]:
                - img "All-Fates Stalker" [ref=e711]
                - img [ref=e713]
              - generic [ref=e715]:
                - generic "All-Fates Stalker" [ref=e716]
                - generic [ref=e717]:
                  - generic [ref=e718]: "Owned: 1"
                  - generic [ref=e719]: "Used: 0"
                - generic [ref=e720]: —
          - listitem [ref=e721]:
            - generic [ref=e722]:
              - button "Ally — tap to expand printing details" [ref=e723] [cursor=pointer]:
                - img "Ally" [ref=e725]
                - img [ref=e727]
              - generic [ref=e729]:
                - generic "Ally" [ref=e730]
                - generic [ref=e731]:
                  - generic [ref=e732]: "Owned: 2"
                  - generic [ref=e733]: "Used: 0"
                - generic [ref=e734]: —
          - listitem [ref=e735]:
            - generic [ref=e736]:
              - button "Alpharael, Dreaming Acolyte — tap to expand printing details" [ref=e737] [cursor=pointer]:
                - img "Alpharael, Dreaming Acolyte" [ref=e739]
                - img [ref=e741]
              - generic [ref=e743]:
                - generic "Alpharael, Dreaming Acolyte" [ref=e744]
                - generic [ref=e745]:
                  - generic [ref=e746]: "Owned: 1"
                  - generic [ref=e747]: "Used: 0"
                - generic [ref=e748]: —
          - listitem [ref=e749]:
            - generic [ref=e750]:
              - button "Altar of Bone — tap to expand printing details" [ref=e751] [cursor=pointer]:
                - img "Altar of Bone" [ref=e753]
                - img [ref=e755]
              - generic [ref=e757]:
                - generic "Altar of Bone" [ref=e758]
                - generic [ref=e759]:
                  - generic [ref=e760]: "Owned: 1"
                  - generic [ref=e761]: "Used: 0"
                - generic [ref=e762]: —
          - listitem [ref=e763]:
            - generic [ref=e764]:
              - button "Altered Ego — tap to expand printing details" [ref=e765] [cursor=pointer]:
                - img "Altered Ego" [ref=e767]
                - img [ref=e769]
              - generic [ref=e771]:
                - generic "Altered Ego" [ref=e772]
                - generic [ref=e773]:
                  - generic [ref=e774]: "Owned: 1"
                  - generic [ref=e775]: "Used: 0"
                - generic [ref=e776]: —
          - listitem [ref=e777]:
            - generic [ref=e778]:
              - button "Amarant Coral — tap to expand printing details" [ref=e779] [cursor=pointer]:
                - img "Amarant Coral" [ref=e781]
                - img [ref=e783]
              - generic [ref=e785]:
                - generic "Amarant Coral" [ref=e786]
                - generic [ref=e787]:
                  - generic [ref=e788]: "Owned: 1"
                  - generic [ref=e789]: "Used: 0"
                - generic [ref=e790]: —
          - listitem [ref=e791]:
            - generic [ref=e792]:
              - button "Ambition's Cost — tap to expand printing details" [ref=e793] [cursor=pointer]:
                - img "Ambition's Cost" [ref=e795]
                - img [ref=e797]
              - generic [ref=e799]:
                - generic "Ambition's Cost" [ref=e800]
                - generic [ref=e801]:
                  - generic [ref=e802]: "Owned: 1"
                  - generic [ref=e803]: "Used: 0"
                - generic [ref=e804]: —
          - listitem [ref=e805]:
            - generic [ref=e806]:
              - button "Ambitious Augmenter — tap to expand printing details" [ref=e807] [cursor=pointer]:
                - img "Ambitious Augmenter" [ref=e809]
                - img [ref=e811]
              - generic [ref=e813]:
                - generic "Ambitious Augmenter" [ref=e814]
                - generic [ref=e815]:
                  - generic [ref=e816]: "Owned: 1"
                  - generic [ref=e817]: "Used: 0"
                - generic [ref=e818]: —
          - listitem [ref=e819]:
            - generic [ref=e820]:
              - button "Ambush Wolf — tap to expand printing details" [ref=e821] [cursor=pointer]:
                - img "Ambush Wolf" [ref=e823]
                - img [ref=e825]
              - generic [ref=e827]:
                - generic "Ambush Wolf" [ref=e828]
                - generic [ref=e829]:
                  - generic [ref=e830]: "Owned: 1"
                  - generic [ref=e831]: "Used: 0"
                - generic [ref=e832]: —
        - generic [ref=e833]:
          - generic [ref=e834]: Showing 50 of 2,416 cards · Page 1 of 49
          - generic [ref=e835]:
            - button "Previous page" [disabled]:
              - img
            - button "Next page" [ref=e836]:
              - img [ref=e837]
  - region "Notifications alt+T"
  - alert [ref=e839]
```

# Test source

```ts
  1   | /**
  2   |  * The Oracle — Comprehensive E2E Test Suite
  3   |  *
  4   |  * Covers all user-facing functionality across the application.
  5   |  * Tests run against a live dev server with real Supabase data.
  6   |  *
  7   |  * Prerequisites:
  8   |  *   1. Start the dev server:  npm run dev
  9   |  *   2. Install browsers:      npx playwright install chromium
  10  |  *   3. Ensure you're logged in (auth session active)
  11  |  *   4. At least one deck imported and one storage location configured
  12  |  *
  13  |  * Run:
  14  |  *   npx playwright test
  15  |  *   npx playwright test --headed    (watch it run)
  16  |  *   npx playwright test --ui        (interactive UI mode)
  17  |  */
  18  | 
  19  | import { test, expect, type Page } from '@playwright/test'
  20  | 
  21  | const LOAD_TIMEOUT = 30_000
  22  | const ACTION_TIMEOUT = 15_000
  23  | 
  24  | // ═══════════════════════════════════════════════════════════════════════════════
  25  | // 1. NAVIGATION & LAYOUT
  26  | // ═══════════════════════════════════════════════════════════════════════════════
  27  | 
  28  | test.describe('Navigation & Layout', () => {
  29  |   test('sidebar is visible with all nav links', async ({ page }) => {
  30  |     await page.goto('/')
  31  |     const sidebar = page.locator('nav, aside, [data-slot="sidebar"]').first()
  32  |     await expect(sidebar).toBeVisible({ timeout: LOAD_TIMEOUT })
  33  | 
  34  |     // Check key nav items exist
  35  |     await expect(page.getByText('Decks')).toBeVisible()
  36  |     await expect(page.getByText('Collection')).toBeVisible()
  37  |     await expect(page.getByText('Storage')).toBeVisible()
  38  |   })
  39  | 
  40  |   test('can navigate to all main pages', async ({ page }) => {
  41  |     await page.goto('/')
  42  |     await expect(page).toHaveURL(/\/$/)
  43  | 
  44  |     // Navigate to Collection
  45  |     await page.getByText('Collection').click()
  46  |     await page.waitForURL('**/collection')
  47  |     await expect(page).toHaveURL(/\/collection/)
  48  | 
  49  |     // Navigate to Storage
> 50  |     await page.getByText('Storage').click()
      |                                     ^ Error: locator.click: Test timeout of 60000ms exceeded.
  51  |     await page.waitForURL('**/storage')
  52  |     await expect(page).toHaveURL(/\/storage/)
  53  | 
  54  |     // Navigate to Settings
  55  |     await page.getByText('Settings').click()
  56  |     await page.waitForURL('**/settings')
  57  |     await expect(page).toHaveURL(/\/settings/)
  58  | 
  59  |     // Navigate back to Decks
  60  |     await page.getByText('Decks').click()
  61  |     await page.waitForURL(/^\/$|\/decks/)
  62  |   })
  63  | })
  64  | 
  65  | // ═══════════════════════════════════════════════════════════════════════════════
  66  | // 2. DECKS GRID (HOME PAGE)
  67  | // ═══════════════════════════════════════════════════════════════════════════════
  68  | 
  69  | test.describe('Decks Grid', () => {
  70  |   test('deck tiles render with commander art', async ({ page }) => {
  71  |     await page.goto('/')
  72  |     const deckList = page.getByRole('list', { name: /deck list/i })
  73  |     await expect(deckList).toBeVisible({ timeout: LOAD_TIMEOUT })
  74  | 
  75  |     const tiles = deckList.getByRole('listitem')
  76  |     const count = await tiles.count()
  77  |     expect(count).toBeGreaterThan(0)
  78  | 
  79  |     // Each tile should have an image (commander art)
  80  |     const firstTile = tiles.first()
  81  |     await expect(firstTile.locator('img').first()).toBeVisible()
  82  |   })
  83  | 
  84  |   test('deck tiles show status badges (Brewing/Built/Archived)', async ({ page }) => {
  85  |     await page.goto('/')
  86  |     const deckList = page.getByRole('list', { name: /deck list/i })
  87  |     await expect(deckList).toBeVisible({ timeout: LOAD_TIMEOUT })
  88  | 
  89  |     // At least one badge should be visible
  90  |     const badges = page.locator('text=/Brewing|Built|Archived/')
  91  |     await expect(badges.first()).toBeVisible({ timeout: ACTION_TIMEOUT })
  92  |   })
  93  | 
  94  |   test('clicking a deck tile navigates to deck detail', async ({ page }) => {
  95  |     await page.goto('/')
  96  |     const deckList = page.getByRole('list', { name: /deck list/i })
  97  |     await expect(deckList).toBeVisible({ timeout: LOAD_TIMEOUT })
  98  | 
  99  |     const firstTile = deckList.getByRole('listitem').first()
  100 |     const link = firstTile.locator('a').first()
  101 |     await link.click()
  102 | 
  103 |     await page.waitForURL('**/decks/**')
  104 |     expect(page.url()).toMatch(/\/decks\/\d+/)
  105 |   })
  106 | 
  107 |   test('brew sessions render in the grid', async ({ page }) => {
  108 |     await page.goto('/')
  109 |     // Wait for page to fully load
  110 |     await page.waitForTimeout(2000)
  111 |     // Brew sessions show as tiles (may or may not exist)
  112 |     // Just verify the page loaded without errors
  113 |     await expect(page.locator('body')).not.toContainText('Application error')
  114 |   })
  115 | })
  116 | 
  117 | // ═══════════════════════════════════════════════════════════════════════════════
  118 | // 3. DECK DETAIL PAGE
  119 | // ═══════════════════════════════════════════════════════════════════════════════
  120 | 
  121 | test.describe('Deck Detail', () => {
  122 |   let deckUrl: string
  123 | 
  124 |   test.beforeEach(async ({ page }) => {
  125 |     await page.goto('/')
  126 |     const deckList = page.getByRole('list', { name: /deck list/i })
  127 |     await expect(deckList).toBeVisible({ timeout: LOAD_TIMEOUT })
  128 |     const link = deckList.getByRole('listitem').first().locator('a').first()
  129 |     const href = await link.getAttribute('href')
  130 |     deckUrl = href!
  131 |   })
  132 | 
  133 |   test('persistent header shows deck name and card count', async ({ page }) => {
  134 |     await page.goto(deckUrl)
  135 |     await expect(page.locator('h1').first()).toBeVisible({ timeout: LOAD_TIMEOUT })
  136 |     await expect(page.getByText(/\d+ cards/)).toBeVisible()
  137 |   })
  138 | 
  139 |   test('all five tabs are present', async ({ page }) => {
  140 |     await page.goto(deckUrl)
  141 |     await expect(page.getByRole('tab', { name: 'Cards' })).toBeVisible({ timeout: LOAD_TIMEOUT })
  142 |     await expect(page.getByRole('tab', { name: 'Analysis' })).toBeVisible()
  143 |     await expect(page.getByRole('tab', { name: 'Combos' })).toBeVisible()
  144 |     await expect(page.getByRole('tab', { name: 'Upgrade' })).toBeVisible()
  145 |     await expect(page.getByRole('tab', { name: 'Strategy' })).toBeVisible()
  146 |   })
  147 | 
  148 |   test('cards tab has three view modes (Groups, List, Cards)', async ({ page }) => {
  149 |     await page.goto(deckUrl)
  150 |     await expect(page.getByRole('tab', { name: 'Cards' })).toBeVisible({ timeout: LOAD_TIMEOUT })
```