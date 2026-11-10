/* Bänkplacering – fliken Guider
 * En lång sida med innehållsförteckning högst upp. Klick i förteckningen
 * hoppar ner till rätt avsnitt; man kan också skrolla igenom allt.
 */
window.Guide = (() => {
  'use strict';

  // Bildernas mått, så att sidan inte hoppar när bilderna laddas
  const SIZES = {"data":[2448,438],"gr-flaggor":[2380,782],"gr-grupper":[2388,774],"gr-historik":[2380,654],"gr-karta":[2380,1034],"gr-platser":[2448,402],"gr-resultat":[2448,746],"gr-schema":[2388,796],"gr-verktyg":[2388,188],"klasser-lagg-till":[1888,596],"klasser-lista":[1896,1258],"klasser-onskemal":[1128,1096],"klasser-plats-rad":[1872,124],"klasser-plats-strikt":[1128,1030],"klasser-plats":[1128,1030],"klassrum-grupprum":[1888,512],"klassrum-mall":[1888,308],"klassrum-rita":[1896,1444],"klassrum-zoner":[1896,1130],"lottning-karta":[2448,1224],"lottning-kontroller":[2448,606],"lottning-rapport":[2448,288],"lottning-spara":[2448,176],"sparade":[2448,478],"uppdateringar":[1128,1442]};
  const fig = (file, caption) =>
    `<figure class="gfig ${(SIZES[file] || [9999])[0] < 1300 ? 'narrow' : ''}"><img src="img/guide/${file}.jpg" width="${(SIZES[file] || [0])[0]}" height="${(SIZES[file] || [0, 0])[1]}" alt="${caption.replace(/<[^>]+>/g, '').replace(/"/g, '&quot;')}" loading="lazy" data-zoom><figcaption>${caption}</figcaption></figure>`;
  const steps = items => `<ol class="gsteps">${items.map(i => `<li>${i}</li>`).join('')}</ol>`;
  const tip = (t, kind = 'tip') => `<div class="gbox ${kind}"><b>${kind === 'ex' ? 'Exempel' : kind === 'warn' ? 'Bra att veta' : 'Tips'}</b>${t}</div>`;
  const top = '<button class="gtop" data-gjump="guide-top">↑ Till innehållet</button>';

  const SECTIONS = [
    {
      id: 'g-start', icon: '🧭', title: 'Kom igång', lead: 'Hur appen hänger ihop och i vilken ordning du gör saker.',
      body: () => `
        <p>Appen har två delar som bygger på samma klasser och klassrum:</p>
        <ul>
          <li><b>Lottning</b> – lottar vem som sitter var i klassrummet, med hänsyn till önskemål, kön och vilka som inte ska sitta ihop.</li>
          <li><b>Grupprum</b> – delar in klassen i grupper och lottar vilken grupp som får sitta i vilket grupprum, rättvist över tid.</li>
        </ul>
        <p>Första gången gör du så här:</p>
        ${steps([
          '<b>Klassrum</b> – rita upp hur bänkarna står och lägg till de grupprum som hör till salen.',
          '<b>Klasser</b> – skapa klassen, klistra in elevnamnen och fyll i kön och önskemål.',
          '<b>Lottning</b> – välj klass och klassrum och tryck på <i>Lotta ny placering</i>. Spara placeringen.',
          '<b>Grupprum</b> – utgå från placeringen, skapa grupper och lotta rum.'
        ])}
        ${tip('Vill du prova först? Gå till fliken <b>Data</b> och tryck på <i>Ladda exempeldata</i>. Då får du en färdig exempelsal med grupprum och en exempelklass med önskemål. Du kan ta bort den sedan.')}
        ${tip('Allt sparas automatiskt i webbläsaren på den dator du använder. Läs avsnittet <a href="#" data-gjump="g-data">Säkerhetskopia</a> om du vill använda appen på flera datorer.', 'warn')}`
    },
    {
      id: 'g-klassrum', icon: '🪑', title: 'Rita klassrummet', lead: 'Bänkar, tavelvy, bänkar som står ihop och snabbmallen.',
      body: () => `
        <p>Klassrummet är ett rutnät. <b>Varje ruta är en plats för en elev.</b> En bänk tar två rutor – det är alltid en dubbelbänk med två platser.</p>
        ${steps([
          'Gå till <b>Klassrum</b> och tryck på <i>+ Nytt klassrum</i>. Ge det ett namn, t.ex. salens nummer.',
          'Ställ in <b>Kolumner</b> (platser på bredden) och <b>Rader</b> (platser på djupet).',
          'Välj verktyget <b>Bänk vågrät</b> eller <b>Bänk lodrät</b> och klicka på en tom ruta för att ställa ut en bänk.',
          'Klicka på en bänk du redan ställt ut för att <b>vrida</b> den. Med <b>Flytta</b> klickar du först på bänken och sedan där den ska stå. Med <b>Ta bort</b> klickar du på bänken som ska bort.'
        ])}
        ${fig('klassrum-rita', 'Verktygen (markerade) väljer vad ett klick gör. Bänkar som står kant i kant får en mörk skarv emellan.')}
        <h3>Tavelvy – rita som du ser salen</h3>
        <p>Knappen <b>Lärarvy (tavlan nere)</b> vänder på ritningen så att tavlan hamnar längst ner, som när du står vid tavlan och tittar ut i klassen. Det är ofta lättare att rita salen så. Knappen <b>Elevvy (tavlan uppe)</b> vänder tillbaka. Vyn gäller både när du ritar och när du tittar på lottningen.</p>
        <h3>Bänkar som står ihop</h3>
        <p>Står två bänkar <b>kant i kant</b> (utan tom ruta emellan och åt samma håll) räknas eleverna på kanterna som <b>grannar</b>. En elev kan då ha en bänkkompis på ena sidan och en granne på andra sidan – och lottningen får fler sätt att uppfylla önskemål. Lämna en tom ruta mellan bänkarna om de ska stå isär.</p>
        <h3>Snabbmall</h3>
        <p>Har salen vanliga bänkrader går det fortare med <b>Snabbmall</b> längst ner. Ange hur många <b>dubbelbänkar per rad</b>, hur många <b>rader</b> och hur många bänkar som <b>står ihop</b>. Mallen ersätter bänkarna som finns, och du kan sedan justera för hand.</p>
        ${fig('klassrum-mall', 'Snabbmallen: 4 dubbelbänkar per rad, 4 rader, två och två ihop – som exempelsalen ovan.')}
        <h3>Grupprum till klassrummet</h3>
        <p>Under ritningen lägger du till de grupprum som hör till salen. För varje rum anger du <b>Max grupper</b> – hur många grupper rummet brukar kunna ta. Du kan också begränsa hur många grupper som får stanna kvar i klassrummet (tomt = alla). Mer om det i <a href="#" data-gjump="g-gr">guiden för grupprum</a>.</p>
        ${fig('klassrum-grupprum', 'Grupprummen som hör till salen. Här tar Biblioteket två grupper, de andra en var.')}
        ${tip('Har du flera salar som ser likadana ut? Rita en och tryck på <b>Duplicera</b>.')}`
    },
    {
      id: 'g-klasser', icon: '👥', title: 'Skapa klass och elever', lead: 'Klistra in namn, ange kön och fyll i önskemål.',
      body: () => `
        ${steps([
          'Gå till <b>Klasser</b> och tryck på <i>+ Ny klass</i>.',
          'Öppna <b>Lägg till elever</b> och skriv eller klistra in ett namn per rad. Skriv <code>, k</code> efter namnet för kille eller <code>, t</code> för tjej om du vill ange det direkt. Du kan klistra in en kolumn från t.ex. Excel.',
          'Tryck på <b>Lägg till</b>.'
        ])}
        ${fig('klasser-lagg-till', 'Ett namn per rad. "k" och "t" efter kommat anger kön – det går också bra att låta bli och fylla i det sedan.')}
        <p>I tabellen kan du sedan ändra namn (klicka i namnet), välja <b>Kille/Tjej</b> och fylla i önskemål.</p>
        ${fig('klasser-lista', 'Elevtabellen. ♥ betyder att två elever har önskat varandra. Röda namn i sista kolumnen ska inte sitta med eleven.')}
        <h3 id="g-onskemal">Önskemål</h3>
        <p>Klicka i rutan <b>Önskar sitta med</b> på en elev. Bocka i de klasskamrater eleven vill sitta med. Hur många man får önska ställer du in med <b>Max antal önskemål per elev</b> (3 från början).</p>
        ${fig('klasser-onskemal', 'Rutan för önskemål. När maxantalet är nått går det inte att välja fler.')}
        <h3>Ska inte sitta med</h3>
        <p>I kolumnen <b>Ska inte sitta med</b> väljer du elever som inte bör hamna bredvid varandra. Det gäller åt båda hållen, och lottningen undviker det mycket starkt.</p>
        ${tip('Lottningen försöker i första hand se till att så många som möjligt får sitta med minst en av dem de önskat. Fler önskemål per elev ger fler möjligheter att lyckas.')}`
    },
    {
      id: 'g-plats', icon: '📍', title: 'Platsönskemål – var i rummet', lead: 'Fram, mitten eller bak – till vänster, i mitten eller till höger. Strikt eller önskemål.',
      body: () => `
        <p>Utöver vem eleven vill sitta med kan du ange <b>var i klassrummet</b> eleven vill – eller måste – sitta. Du väljer bland nio ungefärliga positioner: tre rader (fram, mitten, bak) gånger tre delar (vänster, mitten, höger).</p>
        ${steps([
          'Gå till <b>Klasser</b> och klicka i kolumnen <b>Plats i rummet</b> på eleven.',
          'Klicka i en eller flera rutor. Klicka på en <b>rubrik</b> – t.ex. <i>Bak</i> eller <i>Vänster</i> – för att välja en hel rad eller sida på en gång.',
          'Bocka i <b>Strikt</b> om det måste följas. Annars är det ett önskemål som appen försöker uppfylla.',
          'Tryck på <b>Klar</b>. I tabellen visas en liten karta över de valda rutorna, och en röd etikett om det är strikt.'
        ])}
        ${fig('klasser-plats', 'Ett vanligt önskemål: eleven vill sitta längst bak, och alla tre bakre rutor är valda (genom ett klick på rubriken "Bak").')}
        ${fig('klasser-plats-strikt', 'Ett strikt krav: eleven måste sitta längst bak till vänster. Strikta val visas i rött.')}
        ${fig('klasser-plats-rad', 'Så syns det i elevtabellen: den lilla kartan visar vald ruta, och etiketten visar att det är strikt.')}
        <h3>Vänster och höger</h3>
        <p>Vänster och höger räknas <b>som eleverna ser det</b>, när de sitter med ansiktet mot tavlan – precis som klassrummet ritas i elevvyn (tavlan uppe). Byter du till lärarvyn spegelvänds ritningen, men önskemålen följer med rätt.</p>
        <h3>Strikt eller önskemål?</h3>
        <ul>
          <li><b>Önskemål</b> – appen försöker, och lyckas oftast, men ett önskemål kan vika om det krockar med annat: att någon inte ska sitta med någon, att kompisönskemål går ihop, eller andra elevers strikta krav.</li>
          <li><b>Strikt</b> – eleven placeras alltid i någon av de valda rutorna, så länge det finns lediga platser där. Strikta krav går före allt annat.</li>
        </ul>
        ${tip('En elev vill sitta långt bak: välj alla tre bakre rutor och låt det vara ett önskemål. En annan elev måste sitta längst bak till vänster, t.ex. för att se tavlan eller kunna gå ut: välj bara <i>Bak vänster</i> och bocka i <b>Strikt</b>.', 'ex')}
        <h3>Så översätts rutorna till ditt klassrum</h3>
        <p>De nio rutorna är ungefärliga. Appen delar in bänkraderna i ett främre, ett mittersta och ett bakre band, och platserna från vänster till höger i tre delar. Vill du se exakt hur det blir i en viss sal: gå till <b>Klassrum</b> och tryck på <b>Visa zoner</b>.</p>
        ${fig('klassrum-zoner', 'Zonerna i exempelsalen. Med fyra bänkrader blir första raden "fram", de två mittersta "mitten" och sista raden "bak".')}
        ${tip('Strikta krav behöver plats. Har tre elever ett strikt krav på <i>Bak vänster</i> men där bara finns tre platser, får de plats – men har fem elever samma krav går det inte. Då står det i rött under lottningen vilka som inte kunde placeras enligt kravet. Välj fler rutor eller gör några till vanliga önskemål.', 'warn')}
        <h3>Vid lottningen</h3>
        <p>På fliken Lottning finns rutan <b>Ta hänsyn till platsönskemål</b> (på från början). Efter lottningen visar sammanställningen hur många som sitter där de önskat, och på kartan har varje elev med platsönskemål en liten prick uppe till vänster: <b style="color:#2f8f4e">grön</b> = uppfyllt, <b style="color:#a39e95">grå</b> = inte uppfyllt, <b style="color:#c4402f">röd</b> = strikt krav som inte gick att uppfylla.</p>`
    },
    {
      id: 'g-lottning', icon: '🎲', title: 'Lotta bänkplacering', lead: 'Lotta, läs resultatet, byt för hand och lås platser.',
      body: () => `
        ${steps([
          'Gå till <b>Lottning</b> och välj <b>Klass</b> och <b>Klassrum</b>.',
          'Välj regel för <b>Kön</b>: ingen hänsyn, killar med killar och tjejer med tjejer, eller blandat. Regeln följs om det går, men önskemål väger tyngre.',
          'Bocka i om lottningen ska ta hänsyn till <b>önskemål</b>, <b>"ska inte sitta med"</b> och <b>platsönskemål</b>.',
          'Är någon borta? Öppna <b>Frånvarande idag</b> och klicka på deras namn – de lottas inte in.',
          'Tryck på <b>🎲 Lotta ny placering</b>.'
        ])}
        ${fig('lottning-kontroller', 'Inställningarna. De två lottningsknapparna är markerade. En elev är struken som frånvarande.')}
        <h3>Två sätt att lotta</h3>
        <ul>
          <li><b>Lotta ny placering</b> – lottar om allt: både vem man sitter med och var.</li>
          <li><b>Lotta om platserna – behåll bänkkompisar</b> – samma par sitter kvar ihop men flyttas till nya bänkar. Bra när du vill ha variation i salen utan att dela på paren.</li>
        </ul>
        <h3>Läsa resultatet</h3>
        ${fig('lottning-rapport', 'Sammanställningen visar hur det gick och vilka som inte fick något önskemål uppfyllt.')}
        ${fig('lottning-karta', 'Placeringen. Färgad kant = kille/tjej. ✓ = sitter med någon hen önskat, – = önskemål ej uppfyllt, ! = bredvid någon hen inte ska sitta med. Hänglåset visar en låst plats, och den inramade platsen är vald för byte.')}
        <h3>Byta för hand och låsa</h3>
        <ul>
          <li><b>Byta plats:</b> klicka på en elev och sedan på en annan plats – de byter. Det går också att flytta till en tom plats.</li>
          <li><b>Låsa:</b> för musen över en elev och klicka på hänglåset. Eleven sitter kvar på sin plats när du lottar igen. <i>Lås upp alla</i> tar bort alla lås.</li>
          <li>Tryck <b>Esc</b> om du vill avbryta ett påbörjat byte.</li>
        </ul>
        ${tip('Varje lottning blir olika. Är du inte nöjd – lotta igen, eller lås de platser du gillar och lotta om resten.')}
        ${tip('<b>Skriv ut</b> ger en ren utskrift av placeringen. Välj lärar- eller elevvy innan du skriver ut.')}`
    },
    {
      id: 'g-spara', icon: '💾', title: 'Spara och öppna placeringar', lead: 'Spara en placering med namn och öppna den igen senare.',
      body: () => `
        <p>Längst ner på fliken Lottning sparar du placeringen. Namnet föreslås automatiskt med klass och vecka, men du kan skriva vad du vill.</p>
        ${fig('lottning-spara', 'Spara som ny placering. Har du öppnat en sparad placering finns också en knapp för att uppdatera den.')}
        <p>Under <b>Sparade</b> ser du alla sparade placeringar. <b>Öppna</b> tar dig tillbaka till Lottning med placeringen, där du kan ändra, skriva ut eller uppdatera den.</p>
        ${fig('sparade', 'Sparade placeringar, nyast först. Filtrera på klass uppe till höger.')}
        ${tip('Sparade placeringar är också startpunkten för grupprummen – se nästa avsnitt.')}`
    },
    {
      id: 'g-gr', icon: '🚪', title: 'Grupprum – steg för steg', lead: 'Grupper, lediga rum, rumslottning och cirkulationsschema. Det stora avsnittet.',
      body: () => `
        <p>Fliken <b>Grupprum</b> är till för när eleverna går iväg och arbetar i grupper. Den svarar på tre frågor:</p>
        <ul>
          <li><b>Vilka</b> är i samma grupp?</li>
          <li><b>Var</b> ska varje grupp sitta – i klassrummet eller i något av grupprummen?</li>
          <li><b>Är det rättvist</b> över tid – får alla som vill sitta i grupprum lika ofta, och på olika ställen?</li>
        </ul>
        <p>Den här delen är helt fristående från bänklottningen – inget du gör här ändrar placeringarna. Den använder bara klassens elever och, om du vill, en sparad placering som utgångspunkt.</p>

        <h3 id="g-gr-1"><span class="gnum">1</span>Lägg till grupprummen (en gång)</h3>
        <p>Grupprummen hör till ett klassrum. Gå till <b>Klassrum</b>, välj salen och lägg till rummen under <b>Grupprum till …</b> längst ner. Ange hur många grupper varje rum brukar ta.</p>
        ${fig('klassrum-grupprum', 'Exempelsalen har tre grupprum. Biblioteket rymmer två grupper.')}

        <h3 id="g-gr-2"><span class="gnum">2</span>Välj klass och placering</h3>
        <p>Gå till <b>Grupprum</b>. Välj <b>Klass</b> och under <b>Utgå från placering</b> den placering eleverna sitter i just nu – antingen <i>Aktuell lottning</i> eller en sparad placering. Klassrummet och vilka som var frånvarande följer med automatiskt.</p>
        <p>Vill du inte utgå från någon placering väljer du <i>Ingen</i> och väljer klassrum själv. Då skapar du grupperna från namnlistan i stället.</p>

        <h3 id="g-gr-3"><span class="gnum">3</span>Markera vilka rum som är lediga idag</h3>
        <p>Under <b>Platser idag</b> syns klassrummet och alla grupprum. <b>Klicka på ett grupprum</b> för att markera det som upptaget – det blir överstruket och används inte i lottningen. Klicka igen så blir det ledigt.</p>
        <p>Rutan <b>max</b> styr hur många grupper som får vara i rummet <i>just idag</i>. Vill du bara ha en grupp i biblioteket fast det rymmer två – skriv 1. Det ändrar inte inställningen för klassrummet, bara dagens lottning.</p>
        ${fig('gr-platser', 'Grupprum 2 är upptaget idag, och biblioteket får bara ta en grupp. Klassrummet räknas alltid som en plats – två lediga grupprum ger alltså tre platser.')}
        ${tip('Klassrummet är alltid med. Grupper som inte får något grupprum stannar där. Vill du att bara en grupp ska stanna i klassrummet skriver du 1 i dess max-ruta.', 'warn')}

        <h3 id="g-gr-4"><span class="gnum">4</span>Skapa grupperna</h3>
        <p>Det finns fyra snabba sätt, och du kan alltid justera efteråt:</p>
        ${fig('gr-verktyg', 'Verktygen för att skapa grupper.')}
        <ul>
          <li><b>Från placeringen</b> – grupperna bildas av hur eleverna sitter, rad för rad. Välj ungefärlig storlek: <i>2 – bänkkompisar</i>, <i>ca 3</i>, <i>ca 4</i>, <i>ca 6</i> eller <i>bänkar som står ihop</i> (alla som sitter vid sammanställda bänkar blir en grupp). Appen fördelar så jämnt det går och låter ingen bli ensam i en grupp.</li>
          <li><b>Slumpa grupper om …</b> – blandar alla närvarande elever i grupper av ungefär den storleken.</li>
          <li><b>Samma grupper som förra gången</b> – tar grupperna från det senast sparade tillfället.</li>
          <li><b>+ Ny grupp</b> – en tom grupp som du fyller själv.</li>
        </ul>
        ${tip('Klassen sitter i par, och du vill ha fyragrupper som liknar hur de sitter. Välj <i>ca 4</i> och tryck <i>Skapa</i>. Två bänkar bredvid varandra i samma rad blir en grupp. Sitter sju elever i en rad blir det en fyra och en trea; sitter fem blir de en grupp på fem.', 'ex')}
        <p>Grupperna syns i färg direkt på kartan över klassrummet, med gruppens bokstav i hörnet:</p>
        ${fig('gr-karta', 'Grupper skapade från placeringen med "ca 4". Grupp B är vald (inramad).')}

        <h3 id="g-gr-5"><span class="gnum">5</span>Justera grupperna</h3>
        <p>Under kartan finns en ruta per grupp. Så här flyttar du elever:</p>
        ${steps([
          '<b>Klicka på en grupp</b> så att den blir vald (den får en färgad ram).',
          '<b>Klicka på en elev</b> – på kartan, i en annan grupp eller i listan <i>Inte i någon grupp</i> – så flyttas eleven till den valda gruppen.',
          'Klickar du på en elev som redan är i den valda gruppen tas eleven bort ur gruppen.',
          'Klickar du på en elev utan att någon grupp är vald skapas en ny grupp med eleven i.'
        ])}
        ${fig('gr-grupper', 'Grupprutorna. Varje ruta visar eleverna och har ett val för rum. × tar bort gruppen (eleverna hamnar i "Inte i någon grupp").')}
        ${tip('Grupperna kan vara olika stora – två, tre, sex – det spelar ingen roll för lottningen. Rättvisan räknas per elev.')}

        <h3 id="g-gr-6"><span class="gnum">6</span>Frånvarande, vill stanna kvar och löften</h3>
        <p>Under rutan <b>Frånvarande, vill stanna kvar och löften</b> finns tre listor. Klicka på ett namn för att slå på eller av:</p>
        <ul>
          <li><b>Frånvarande idag</b> – eleven tas bort ur grupperna och räknas inte.</li>
          <li><b>⌂ Stannar hellre i klassrummet</b> – för elever som inte vill gå till grupprum. De lottas helst inte dit och räknas inte in i rättvisan. Inställningen ligger kvar tills du tar bort den.</li>
          <li><b>★ Lovad grupprum nästa gång</b> – har du lovat någon grupprum går eleven (och därmed elevens grupp) före. Stjärnan försvinner av sig själv när eleven fått ett grupprum och tillfället sparats.</li>
        </ul>
        ${fig('gr-flaggor', 'Här vill en elev hellre stanna i klassrummet (⌂) och en annan är lovad grupprum (★).')}

        <h3 id="g-gr-7"><span class="gnum">7</span>Lotta rum</h3>
        <p>Tryck på <b>🎲 Lotta rum</b>. Appen provar tusentals fördelningar och väljer den rättvisaste. Den tänker så här:</p>
        <ul>
          <li>Ingen ska om möjligt hamna i <b>samma grupprum som förra gången</b>.</li>
          <li>Den som suttit <b>färre gånger</b> på ett ställe går före den som varit där ofta – det gäller både grupprummen och klassrummet. Den som suttit i klassrummet många gånger får alltså gärna ett grupprum.</li>
          <li>Lediga grupprum ska <b>användas</b> om det finns grupper att fylla dem med.</li>
          <li>Rummens <b>max antal grupper</b> följs.</li>
          <li>Är två alternativ lika bra avgör slumpen.</li>
        </ul>
        ${fig('gr-resultat', 'Resultatet: vilka grupper som sitter var. Den gröna raden bekräftar att ingen hamnade i samma grupprum som förra gången.')}
        <p>Har någon ändå hamnat där hen satt förra gången (det kan vara omöjligt att undvika när det är få rum) visas det i en gul lista under resultatet. Du kan alltid <b>ändra rum för hand</b> med valet <i>Rum</i> i varje grupps ruta, eller lotta igen.</p>
        ${tip('Klassen har 7 grupper och idag är Grupprum 1 och Biblioteket lediga (Biblioteket tar två). Då får tre grupper sitta i grupprum och fyra stannar i klassrummet. Nästa lektion lottar appen i första hand ut grupprummen till elever som satt i klassrummet förra gången.', 'ex')}

        <h3 id="g-gr-8"><span class="gnum">8</span>Spara tillfället i schemat</h3>
        <p>När du är nöjd fyller du i <b>datum</b> (dagens datum föreslås) och gärna en <b>anteckning</b>, och trycker på <b>Spara tillfället i schemat</b>. <b>Det är först när du sparar som tillfället räknas in i rättvisan.</b> En lottning du inte sparar påverkar inget.</p>
        ${tip('Spara efter lektionen, eller när du vet att grupperna faktiskt satt där. Lottade du men ändrade dig under lektionen kan du ändra rummen för hand innan du sparar.', 'warn')}

        <h3 id="g-gr-9"><span class="gnum">9</span>Läs cirkulationsschemat</h3>
        <p>Längst ner på fliken finns <b>Cirkulationsschemat</b> för klassen. Det visar för varje elev hur många gånger hen suttit på varje plats.</p>
        ${fig('gr-schema', 'Siffrorna är antal gånger. Den markerade rutan visar var eleven satt senast. ⌂ = vill hellre stanna i klassrummet.')}
        <ul>
          <li><b>Grupprum totalt</b> – hur många gånger eleven suttit i något grupprum. Ju jämnare den kolumnen är, desto rättvisare.</li>
          <li><b>Senast</b> – var och när eleven satt senast.</li>
          <li>Grå nollor visar ställen eleven aldrig fått sitta på – de prioriteras i kommande lottningar.</li>
        </ul>
        <p>Under <b>Tidigare tillfällen</b> ser du alla sparade tillfällen. Sparade du fel tar du bort tillfället med × – då räknas det inte längre.</p>
        ${fig('gr-historik', 'Tidigare tillfällen, nyast först, med vilka som satt i vilket grupprum.')}

        <h3 id="g-gr-ex">Exempel: en vecka med grupprum</h3>
        ${tip(`
          <p><b>Måndag.</b> Du utgår från veckans placering, skapar grupper med <i>ca 4</i> och har två lediga rum. Grupperna A och C hamnar i grupprum, resten i klassrummet. Du sparar.</p>
          <p><b>Onsdag.</b> Grupprum 2 är upptaget. Du klickar på det så att det blir överstruket, trycker <i>Samma grupper som förra gången</i> och lottar. Nu får en grupp som satt i klassrummet i måndags grupprummet – inte A eller C. Du sparar.</p>
          <p><b>Fredag.</b> Ny gruppindelning med <i>Slumpa grupper om 3</i>. Även om grupperna är nya kommer appen ihåg varje elev: de som suttit i grupprum två gånger den här veckan hamnar hellre i klassrummet, och de som inte varit iväg alls går före.</p>
          <p>Efter några veckor ska kolumnen <i>Grupprum totalt</i> i schemat vara ungefär lika för alla som vill.</p>`, 'ex')}`
    },
    {
      id: 'g-data', icon: '🗂️', title: 'Säkerhetskopia och flera datorer', lead: 'Var allt sparas och hur du flyttar det.',
      body: () => `
        <p>Appen sparar allt automatiskt i <b>webbläsaren</b> på den dator du använder: klassrum, klasser, önskemål, placeringar och grupprumsschemat. Det finns kvar när du stänger sidan – men bara på den datorn och i den webbläsaren.</p>
        ${fig('data', 'Fliken Data.')}
        <ul>
          <li><b>Ladda ner säkerhetskopia</b> – sparar allt i en fil. Gör det då och då.</li>
          <li><b>Återställ från fil (ersätter allt)</b> – läser in en säkerhetskopia och ersätter det som finns. Använd det för att flytta allt till en annan dator.</li>
          <li><b>Importera och lägg till</b> – lägger till det som finns i filen utan att ta bort något. Bra om en kollega har skickat sitt klassrum.</li>
        </ul>
        ${tip('Rensar du webbläsarens historik och webbplatsdata kan det som sparats i appen försvinna. En säkerhetskopia skyddar mot det.', 'warn')}`
    },
    {
      id: 'g-version', icon: '🔄', title: 'Uppdateringar och version', lead: 'Se vilken version du kör, vad som är nytt och om den senaste är inladdad.',
      body: () => `
        <p>Uppe till höger i menyraden står versionsnumret som körs just nu, t.ex. <b>v${window.BP ? window.BP.APP_VERSION : ''}</b>. Klicka på det för att öppna <b>Uppdateringar</b>.</p>
        ${fig('uppdateringar', 'Uppdateringar: versionen som är igång är markerad, och under varje version står vad som är nytt.')}
        <ul>
          <li>Högst upp står om du kör den <b>senaste versionen</b>. Appen frågar webbplatsen när sidan laddas.</li>
          <li>Finns det en nyare version visas en <b>gul rad</b> överst på sidan och versionsnumret blir gult. Tryck på <b>Ladda om</b>.</li>
          <li>Under varje version står vad som ändrats, nyast först.</li>
        </ul>
        ${tip('Har du just laddat upp en ny version på GitHub kan det ta någon minut innan GitHub Pages visar den. Ladda om sidan efter en stund – när versionsnumret uppe till höger stämmer är den nya versionen igång.', 'warn')}`
    },
    {
      id: 'g-faq', icon: '💡', title: 'Vanliga frågor', lead: 'Korta svar på sådant som brukar dyka upp.',
      body: () => `
        <dl class="gfaq">
          <dt>Är en ruta i klassrummet en bänk eller en plats?</dt>
          <dd>En ruta är en plats för en elev. En bänk tar alltid två rutor.</dd>
          <dt>Varför fick inte alla sina önskemål uppfyllda?</dt>
          <dd>Ibland går det inte – t.ex. när flera önskar samma person. Lotta igen för ett annat förslag, låt eleverna önska fler personer, eller byt för hand.</dd>
          <dt>Kan jag ändra en klass efter att jag lottat?</dt>
          <dd>Ja. Nya elever saknar plats tills du lottar igen eller placerar dem för hand (klicka på namnet under "Saknar plats" och sedan på en tom plats).</dd>
          <dt>Påverkar grupprummen bänkplaceringen?</dt>
          <dd>Nej. Grupprumsdelen läser bara placeringen för att skapa grupper. Den ändrar den aldrig.</dd>
          <dt>Måste grupperna vara lika stora?</dt>
          <dd>Nej. En grupp kan vara 2, 3, 4 eller 6 elever. Rättvisan räknas per elev.</dd>
          <dt>En elev med strikt platskrav hamnade fel – varför?</dt>
          <dd>Antingen finns det inte tillräckligt många platser i de valda rutorna (fler strikta krav än platser), eller så är eleven låst på en annan plats. Sammanställningen efter lottningen säger vilka det gäller. Kontrollera också med <i>Visa zoner</i> under Klassrum att rutorna ligger där du tänkt.</dd>
          <dt>Gäller platsönskemålen när jag lottar om platserna men behåller bänkkompisar?</dt>
          <dd>Ja, så långt det går. Men eftersom paren hålls ihop flyttas båda eleverna tillsammans, så det kan vara svårare att uppfylla allt. Lotta en ny placering om ett strikt krav inte går att uppfylla.</dd>
          <dt>Hur vet jag att den senaste versionen är igång?</dt>
          <dd>Klicka på versionsnumret uppe till höger. Där står om du kör den senaste versionen.</dd>
          <dt>Vad händer om jag tar bort ett grupprum från klassrummet?</dt>
          <dd>Historiken finns kvar i schemat, men rummet går inte att lotta till längre.</dd>
          <dt>Jag sparade ett grupprumstillfälle av misstag.</dt>
          <dd>Öppna <i>Tidigare tillfällen</i> under cirkulationsschemat och ta bort det med ×.</dd>
        </dl>`
    }
  ];

  function render(v) {
    v.innerHTML = `
      <div class="guide" id="guide-top">
        <section class="card ghero">
          <h1>Guider</h1>
          <p>Allt om hur appen fungerar, steg för steg. Klicka på ett avsnitt för att hoppa dit – eller skrolla igenom hela sidan. Klicka på en bild för att se den större.</p>
          <div class="gtoc">${SECTIONS.map(s => `
            <button class="gtoc-item ${s.id === 'g-gr' ? 'feat' : ''}" data-gjump="${s.id}">
              <span class="gi">${s.icon}</span><span><b>${s.title}</b><small>${s.lead}</small></span>
            </button>`).join('')}</div>
          <div class="gsub"><span class="small muted">Direkt till grupprumsstegen:</span>
            ${[['g-gr-1', '1. Lägg till grupprum'], ['g-gr-2', '2. Välj placering'], ['g-gr-3', '3. Lediga rum idag'], ['g-gr-4', '4. Skapa grupper'], ['g-gr-5', '5. Justera grupper'], ['g-gr-6', '6. Stanna kvar & löften'], ['g-gr-7', '7. Lotta rum'], ['g-gr-8', '8. Spara'], ['g-gr-9', '9. Schemat'], ['g-gr-ex', 'Exempel']]
              .map(([id, t]) => `<button class="chip" data-gjump="${id}">${t}</button>`).join('')}
          </div>
        </section>
        ${SECTIONS.map(s => `
          <section class="card gsec" id="${s.id}">
            <div class="gsec-head"><span class="gi big">${s.icon}</span><div><h2>${s.title}</h2><p class="muted">${s.lead}</p></div></div>
            ${s.body()}
            ${top}
          </section>`).join('')}
      </div>`;
  }

  function onClick(e) {
    const j = e.target.closest('[data-gjump]');
    if (j) {
      e.preventDefault();
      const el = document.getElementById(j.dataset.gjump);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return true;
    }
    const img = e.target.closest('img[data-zoom]');
    if (img) {
      const m = document.getElementById('modal');
      m.innerHTML = `<form method="dialog" class="zoom"><img src="${img.getAttribute('src')}" alt=""><div class="row between"><span class="small muted">${img.alt}</span><button class="btn primary">Stäng</button></div></form>`;
      m.onchange = null; m.onclose = null;
      m.classList.add('wide');
      m.addEventListener('close', () => m.classList.remove('wide'), { once: true });
      m.showModal();
      return true;
    }
    return false;
  }

  return { render, onClick };
})();
