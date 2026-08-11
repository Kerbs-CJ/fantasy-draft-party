// Football content for the draft party rounds. Deliberately hand-curated
// from well-established, historical facts (not recent/live stats) so nothing
// here goes stale or depends on results after this was written.

// ── Guess the Missing Club ──────────────────────────────────
// Each entry is a player's senior club career, in chronological order
// (simplified to one entry per club — return spells are collapsed into
// their first stint so every club in the list is unique and unambiguous
// as a "missing" answer). `missingIndex` is the club hidden from the
// timeline; `decoys` are two plausible-but-wrong clubs — deliberately
// picked from the same league/country as the real answer so process of
// elimination by "that league doesn't fit" doesn't give it away.
//
// Difficulty is tuned two ways: the roster leans away from the handful of
// names literally everyone knows (no Messi/Ronaldo/Zidane — save those for
// Guess the Footballer), and the hidden club is deliberately the early,
// short, or loan stop rather than the marquee, most-remembered one — the
// club someone would only get right by actually knowing the journey, not
// by recalling the one club they're famous for.
window.MISSING_CLUB_PLAYERS = [
  {
    name: "Zlatan Ibrahimović",
    clubs: ["Malmö FF", "Ajax", "Juventus", "Inter Milan", "Barcelona", "AC Milan", "Paris Saint-Germain", "Manchester United", "LA Galaxy"],
    missingIndex: 0,
    decoys: ["IFK Göteborg", "Helsingborgs IF"],
  },
  {
    name: "David Beckham",
    clubs: ["Manchester United", "Real Madrid", "LA Galaxy", "AC Milan", "Paris Saint-Germain"],
    missingIndex: 3,
    decoys: ["Fiorentina", "Napoli"],
  },
  {
    name: "Thierry Henry",
    clubs: ["Monaco", "Juventus", "Arsenal", "Barcelona", "New York Red Bulls"],
    missingIndex: 1,
    decoys: ["Parma", "Fiorentina"],
  },
  {
    name: "Ronaldinho",
    clubs: ["Grêmio", "Paris Saint-Germain", "Barcelona", "AC Milan", "Flamengo"],
    missingIndex: 1,
    decoys: ["AS Monaco", "Olympique Marseille"],
  },
  {
    name: "Didier Drogba",
    clubs: ["Le Mans", "Guingamp", "Marseille", "Chelsea", "Galatasaray"],
    missingIndex: 1,
    decoys: ["Nantes", "Rennes"],
  },
  {
    name: "Luis Suárez",
    clubs: ["Nacional", "Groningen", "Ajax", "Liverpool", "Barcelona", "Atlético Madrid", "Inter Miami"],
    missingIndex: 1,
    decoys: ["Heerenveen", "Twente"],
  },
  {
    name: "Andrea Pirlo",
    clubs: ["Brescia", "Inter Milan", "AC Milan", "Juventus", "New York City FC"],
    missingIndex: 1,
    decoys: ["Napoli", "Fiorentina"],
  },
  {
    name: "Xabi Alonso",
    clubs: ["Real Sociedad", "Liverpool", "Real Madrid", "Bayern Munich"],
    missingIndex: 0,
    decoys: ["Athletic Bilbao", "Osasuna"],
  },
  {
    name: "Ronaldo Nazário",
    clubs: ["Cruzeiro", "PSV Eindhoven", "Barcelona", "Inter Milan", "Real Madrid", "AC Milan", "Corinthians"],
    missingIndex: 1,
    decoys: ["Feyenoord", "Ajax"],
  },
  {
    name: "Kaká",
    clubs: ["São Paulo", "AC Milan", "Real Madrid", "Orlando City"],
    missingIndex: 0,
    decoys: ["Palmeiras", "Corinthians"],
  },
  {
    name: "Samuel Eto'o",
    clubs: ["Real Madrid", "Mallorca", "Barcelona", "Inter Milan", "Chelsea"],
    missingIndex: 1,
    decoys: ["Espanyol", "Valencia"],
  },
  {
    name: "Clarence Seedorf",
    clubs: ["Ajax", "Sampdoria", "Real Madrid", "Inter Milan", "AC Milan", "Botafogo"],
    missingIndex: 1,
    decoys: ["Parma", "Fiorentina"],
  },
  {
    name: "David Villa",
    clubs: ["Sporting Gijón", "Valencia", "Barcelona", "Atlético Madrid", "New York City FC"],
    missingIndex: 0,
    decoys: ["Real Oviedo", "Racing Santander"],
  },
];

// ── Guess the Footballer ────────────────────────────────────
// clues[] run from most obscure (revealed first) to most obvious (revealed
// last) — guessing correctly on fewer clues scores more.
window.GUESS_PLAYERS = [
  {
    name: "Diego Maradona",
    clues: [
      "Made his professional debut for Argentinos Juniors in 1976, ten days shy of his 16th birthday.",
      "Signed for Napoli in 1984 for what was then a world record transfer fee.",
      "Scored two of the most talked-about goals in World Cup history in the same match, four minutes apart.",
      "Captained his country to World Cup glory in 1986.",
      "Argentine number 10, widely ranked alongside Pelé as the greatest player ever.",
    ],
    decoys: ["Pelé", "Zinedine Zidane", "Ronaldinho", "Roberto Baggio", "Eusébio", "Ferenc Puskás"],
  },
  {
    name: "Johan Cruyff",
    clues: [
      "Wore national team shirts with only two sleeve stripes instead of the usual three, due to a personal sponsorship conflict with the kit manufacturer.",
      "Won the Ballon d'Or three times in the 1970s.",
      "Has a famous piece of ball-control skill named after him, first seen at the 1974 World Cup.",
      "Starred for Ajax before Barcelona, then later managed Barcelona to their first-ever European Cup.",
      "Dutch icon of 'Total Football' who never won a World Cup himself, losing the 1974 final.",
    ],
    decoys: ["Kevin Keegan", "Marco van Basten", "Ruud Gullit", "Dennis Bergkamp", "Michel Platini", "Zico"],
  },
  {
    name: "Franz Beckenbauer",
    clues: [
      "Spent the 1977 to 1980 seasons playing in the North American Soccer League for the New York Cosmos, overlapping briefly with Pelé.",
      "Won the Ballon d'Or twice, in 1972 and 1976.",
      "Nicknamed 'Der Kaiser'.",
      "Spent the bulk of his playing career at Bayern Munich.",
      "One of only two people to win the World Cup as both captain and head coach.",
    ],
    decoys: ["Lothar Matthäus", "Franco Baresi", "Paolo Maldini", "Bobby Moore", "Fabio Cannavaro", "Cafu"],
  },
  {
    name: "Zinedine Zidane",
    clues: [
      "Scored on his full professional debut for Cannes in 1989.",
      "Won the Ballon d'Or in 1998.",
      "Scored two headers in a World Cup final to help his country win their first title.",
      "Sent off in the 2006 World Cup final for a headbutt on Marco Materazzi.",
      "Later managed Real Madrid to three consecutive Champions League titles, from 2016 to 2018.",
    ],
    decoys: ["Michel Platini", "Thierry Henry", "Ronaldinho", "Zico", "Andrea Pirlo", "Roberto Baggio"],
  },
  {
    name: "Ronaldinho",
    clues: [
      "Scored 23 goals in a single youth match for his boyhood club Grêmio at age 13, a result that made national headlines in Brazil.",
      "Scored an audacious free kick against England at the 2002 World Cup that goalkeeper David Seaman never saw coming.",
      "Won back-to-back FIFA World Player of the Year awards in 2004 and 2005.",
      "Known for his permanent grin and elaborate skills while starring for Barcelona in the mid-2000s.",
      "The youngest of Brazil's famous 'Three Rs' attacking trio — alongside Ronaldo Nazário and Rivaldo — that won the 2002 World Cup.",
    ],
    decoys: ["Kaká", "Ronaldo Nazário", "Rivaldo", "Neymar", "Romário", "Zico"],
  },
  {
    name: "George Best",
    clues: [
      "Left his first Manchester United trial homesick after just two days, before being convinced to return.",
      "Scored six goals in a single FA Cup match for Manchester United in 1970.",
      "Won the Ballon d'Or in 1968, the year Manchester United won the European Cup.",
      "Famous Northern Irish winger known as much for his off-field lifestyle as his football.",
      "Never played at a World Cup, as Northern Ireland failed to qualify during his career.",
    ],
    decoys: ["Denis Law", "Bobby Charlton", "Ryan Giggs", "Eusébio", "Johan Cruyff", "Pelé"],
  },
  {
    name: "Michel Platini",
    clues: [
      "Rejected by his hometown club Metz's youth academy over a fitness test.",
      "Won three consecutive Ballon d'Or awards, from 1983 to 1985.",
      "Captained his country to the 1984 European Championship, scoring 9 goals in the tournament — still a record.",
      "Starred for Juventus in the 1980s, winning the European Cup in 1985.",
      "Later became president of UEFA before being banned from football administration.",
    ],
    decoys: ["Zinedine Zidane", "Marco van Basten", "Roberto Baggio", "Diego Maradona", "Zico", "Thierry Henry"],
  },
  {
    name: "Paolo Maldini",
    clues: [
      "Made his Serie A debut at just 16 years old, in 1985.",
      "Played his entire senior career at a single club, across 25 seasons.",
      "Renowned for such clean, positional defending that pundits joked he 'never needed to tackle' anyone.",
      "Scored after just 51 seconds in a Champions League final — still the competition's fastest final goal.",
      "Followed his father Cesare into the AC Milan captaincy, and his own son later played for Milan too.",
    ],
    decoys: ["Franco Baresi", "Alessandro Nesta", "Fabio Cannavaro", "Franz Beckenbauer", "Bobby Moore", "Roberto Carlos"],
  },
  {
    name: "Pelé",
    clues: [
      "Scored on his professional debut for Santos in 1956, aged 15, in a 7-1 win.",
      "Became the youngest scorer in a World Cup final at 17, netting twice for Brazil in 1958.",
      "Won three World Cups with Brazil (1958, 1962, 1970) — the only player ever to do so.",
      "Spent almost his entire club career at a single Brazilian club, before a late spell with the New York Cosmos.",
      "Wore the number 10 shirt for Brazil; widely ranked alongside Maradona as the greatest ever.",
    ],
    decoys: ["Diego Maradona", "Ronaldo Nazário", "Garrincha", "Eusébio", "Zico", "Ferenc Puskás"],
  },
  {
    name: "Lev Yashin",
    clues: [
      "Worked as a metal fitter in a factory as a teenager and was also a talented ice hockey goalkeeper, once winning a national cup in that sport.",
      "Credited with pioneering the modern goalkeeping style of commanding the box and organizing the defense.",
      "Nicknamed the 'Black Spider' for his all-black kit and spectacular reflex saves.",
      "Remains the only goalkeeper ever to win the Ballon d'Or, in 1963.",
      "Soviet goalkeeper widely considered the greatest of all time.",
    ],
    decoys: ["Gordon Banks", "Dino Zoff", "Peter Schmeichel", "Gianluigi Buffon", "Iker Casillas", "Manuel Neuer"],
  },
  {
    name: "Eusébio",
    clues: [
      "Benfica officials reportedly went to unusual lengths to keep him hidden from rival Portuguese club Sporting Lisbon's scouts, who also wanted to sign the young Mozambican star.",
      "Nicknamed the 'Black Panther'.",
      "Top scorer at the 1966 World Cup with 9 goals, despite his country not reaching the final.",
      "Won the Ballon d'Or in 1965 while playing for Benfica.",
      "Portugal's all-time record goalscorer for decades, and Benfica's greatest-ever player.",
    ],
    decoys: ["Luís Figo", "Cristiano Ronaldo", "Rui Costa", "Pelé", "George Best", "Zico"],
  },
  {
    name: "Bobby Moore",
    clues: [
      "Captained West Ham United to victory in the 1965 European Cup Winners' Cup.",
      "Was arrested on suspicion of stealing a bracelet in Bogotá days before the 1970 World Cup, a scandal that made headlines worldwide.",
      "Widely regarded as one of the greatest defenders in history, known for reading the game rather than pace or power.",
      "Captained England to their only World Cup title, in 1966.",
      "Famous for the image of him being chaired off after the 1966 final, lifting the Jules Rimet trophy.",
    ],
    decoys: ["Jack Charlton", "Ray Wilson", "Terry Butcher", "Franz Beckenbauer", "Paolo Maldini", "Franco Baresi"],
  },
  {
    name: "Marco van Basten",
    clues: [
      "His career was cut short in his late 20s by chronic ankle injuries.",
      "Formed a fearsome AC Milan strikeforce alongside two other Dutch internationals, Ruud Gullit and Frank Rijkaard — only one of whom shared his three Ballon d'Or wins.",
      "Won the Ballon d'Or three times, in 1988, 1989, and 1992.",
      "Part of the Dutch side, captained by Ruud Gullit, that won the Netherlands' only major trophy at Euro 1988.",
      "Scored a famous volleyed goal from an almost impossible angle in that tournament's final in 1988.",
    ],
    decoys: ["Ruud Gullit", "Dennis Bergkamp", "Johan Cruyff", "Kevin Keegan", "Gerd Müller", "Roberto Baggio"],
  },
  {
    name: "Roberto Baggio",
    clues: [
      "Suffered a serious knee injury on a poor artificial pitch while playing for lower-league Vicenza early in his career, requiring reconstructive surgery.",
      "Nicknamed 'Il Divin Codino' (the Divine Ponytail) for his distinctive hairstyle.",
      "Scored a famous solo goal weaving past multiple defenders at the 1990 World Cup.",
      "Missed the decisive penalty in the shootout of the 1994 World Cup final, an infamous moment in Italian football.",
      "Devout Buddhist and one of Italy's most beloved players despite the 1994 final heartbreak.",
    ],
    decoys: ["Alessandro Del Piero", "Francesco Totti", "Gianfranco Zola", "Michel Platini", "Zinedine Zidane", "Diego Maradona"],
  },
  {
    name: "Alfredo Di Stéfano",
    clues: [
      "Played full international football for three different countries across his career.",
      "Scored in each of his club's first five European Cup final wins, from 1956 to 1960.",
      "Nicknamed 'La Saeta Rubia' (the Blond Arrow).",
      "Never played at a World Cup finals tournament despite being one of the greatest players of his era.",
      "Widely regarded as the greatest player in Real Madrid's history.",
    ],
    decoys: ["Ferenc Puskás", "Raúl", "Cristiano Ronaldo", "Pelé", "Zico", "Eusébio"],
  },
  {
    name: "Ferenc Puskás",
    clues: [
      "Scored 84 goals in just 85 appearances for Hungary, one of the best goals-per-game ratios in international football history.",
      "Scored a famous drag-back to leave an England defender for dead during Hungary's 6-3 win at Wembley in 1953, still cited as one of the great individual moments in the sport's history.",
      "Fled Hungary after the 1956 revolution and eventually joined Real Madrid.",
      "Formed a devastating attacking partnership with Alfredo Di Stéfano at Real Madrid.",
      "FIFA later named an award for the best goal of the year after him.",
    ],
    decoys: ["Alfredo Di Stéfano", "Sándor Kocsis", "Nándor Hidegkuti", "Pelé", "Gerd Müller", "Eusébio"],
  },
  {
    name: "Gerd Müller",
    clues: [
      "Scored a record 40 goals in the 1971-72 Bundesliga season — a record that stood for nearly 50 years until Robert Lewandowski broke it in 2021.",
      "Nicknamed 'Der Bomber' for his prolific, instinctive finishing inside the penalty box.",
      "Scored the winning goal in the 1974 World Cup final for West Germany.",
      "Spent almost his entire career at Bayern Munich, alongside Franz Beckenbauer.",
      "One of the most prolific goalscorers in football history relative to games played.",
    ],
    decoys: ["Uwe Seeler", "Karl-Heinz Rummenigge", "Jürgen Klinsmann", "Ferenc Puskás", "Alan Shearer", "Ronaldo Nazário"],
  },
  {
    name: "Andrés Iniesta",
    clues: [
      "Made his senior Barcelona debut in 2002 after progressing through La Masia, the club's youth academy.",
      "Formed one of the most celebrated central-midfield partnerships in history, playing for over a decade alongside Barcelona and Spain teammate Xavi.",
      "Spent almost his entire senior career at Barcelona, admired for his elegant dribbling and vision.",
      "Won the World Cup (2010) and two European Championships (2008, 2012) with Spain's dominant 'tiki-taka' generation.",
      "Scored the extra-time winning goal in the 2010 World Cup final for Spain.",
    ],
    decoys: ["Xavi Hernández", "Cesc Fàbregas", "David Silva", "Sergio Busquets", "Xabi Alonso", "Andrea Pirlo"],
  },
  {
    name: "Xavi Hernández",
    clues: [
      "Came through Barcelona's La Masia academy and made his first-team debut in 1998.",
      "Named Player of the Tournament at Euro 2008 as his country won the title.",
      "Renowned as the metronome of Barcelona and Spain's 'tiki-taka' style, completing enormous numbers of passes per game.",
      "Won the World Cup in 2010, alongside long-time midfield partner Andrés Iniesta.",
      "Later returned to manage Barcelona, the only club he played for as a senior.",
    ],
    decoys: ["Andrés Iniesta", "Sergio Busquets", "Xabi Alonso", "Cesc Fàbregas", "Andrea Pirlo", "Steven Gerrard"],
  },
  {
    name: "Thierry Henry",
    clues: [
      "Began his career as a winger at Monaco under manager Arsène Wenger before being converted into a striker.",
      "Won the World Cup with France in 1998, though used mainly as a squad player at the tournament.",
      "Was the Premier League's top scorer as Arsenal's 'Invincibles' went unbeaten through the entire 2003-04 season.",
      "Became Arsenal's all-time record goalscorer, a record that stood for over a decade.",
      "Widely regarded as one of the greatest Premier League players ever, known for his pace and clinical finishing.",
    ],
    decoys: ["Dennis Bergkamp", "Robert Pirès", "Nicolas Anelka", "Didier Drogba", "Alan Shearer", "Ronaldo Nazário"],
  },
  {
    name: "Ronaldo Nazário",
    clues: [
      "Broke into Cruzeiro's first team as a teenager in Brazil, scoring at a phenomenal rate before his move to Europe with PSV Eindhoven.",
      "Overcame serious knee injuries that threatened to end his career in the early 2000s.",
      "Suffered a mysterious seizure hours before the 1998 World Cup final, playing in a below-par performance as his team lost.",
      "Top scorer at the 2002 World Cup with 8 goals as his country won the title.",
      "Won the FIFA World Player of the Year award three times.",
    ],
    decoys: ["Ronaldinho", "Rivaldo", "Romário", "Neymar", "Kaká", "Thierry Henry"],
  },
  {
    name: "Roberto Carlos",
    clues: [
      "Began his career at Palmeiras in Brazil before a brief, unsuccessful spell at Inter Milan.",
      "Renowned as the player who first redefined how attacking a left-back could be — a template Real Madrid's Marcelo would later be endlessly compared to.",
      "Spent over a decade as a key part of Real Madrid's 'Galácticos' era.",
      "Famous for a swerving 1997 free kick against France that appeared to defy physics.",
      "Lifted the World Cup trophy in 2002 as part of Brazil's back line, alongside long-time attacking full-back partner Cafu.",
    ],
    decoys: ["Cafu", "Marcelo", "Dani Alves", "Ashley Cole", "Philipp Lahm", "Paolo Maldini"],
  },
  {
    name: "Cafu",
    clues: [
      "Began his career at São Paulo FC, winning back-to-back Copa Libertadores and Intercontinental Cup titles in the early 1990s before his big move to Europe.",
      "Formed a famous attacking full-back partnership with Roberto Carlos for the national team.",
      "Won Serie A titles with both Roma and AC Milan, and a Champions League with Milan.",
      "Captained his country to World Cup glory in 2002.",
      "The only player to appear in three consecutive World Cup finals: 1994, 1998, and 2002.",
    ],
    decoys: ["Roberto Carlos", "Dani Alves", "Lilian Thuram", "Philipp Lahm", "Paolo Maldini", "Fabio Cannavaro"],
  },
  {
    name: "Didier Drogba",
    clues: [
      "Born in Abidjan, Ivory Coast, but moved to France as a child to live with an uncle who was also a footballer.",
      "Scored a dramatic last-minute equalizing header in the 2012 Champions League final before his team won on penalties.",
      "Won the Premier League Golden Boot twice, in 2006-07 and 2009-10.",
      "Used his fame to help broker a truce during the Ivorian civil war, becoming a national hero.",
      "Ivory Coast's all-time top scorer and one of the Premier League's most feared strikers of his era.",
    ],
    decoys: ["Samuel Eto'o", "Salomon Kalou", "Nicolas Anelka", "Thierry Henry", "Alan Shearer", "Ronaldo Nazário"],
  },
  {
    name: "Lionel Messi",
    clues: [
      "Was sent off for violent conduct on his senior international debut, just minutes after coming on as a substitute in 2005.",
      "Made his professional debut for Barcelona in 2004 at just 17 years old.",
      "Formed a devastating front three nicknamed 'MSN' at Barcelona alongside Suárez and Neymar.",
      "Finally won the World Cup with Argentina in 2022, ending years of near-misses at international level.",
      "Holds a record haul of Ballon d'Or awards, widely debated as the greatest player of his generation.",
    ],
    decoys: ["Cristiano Ronaldo", "Neymar", "Luis Suárez", "Kylian Mbappé", "Diego Maradona", "Ronaldinho"],
  },
  {
    name: "Cristiano Ronaldo",
    clues: [
      "Underwent a heart procedure as a teenager at Sporting CP's academy to correct an irregular heartbeat, a scare that briefly threatened his career before it began.",
      "Won his first Ballon d'Or in 2008 while at Manchester United.",
      "Was the Champions League's top scorer in every one of Real Madrid's four title-winning campaigns during the 2010s, a feat no teammate matched.",
      "Captained Portugal to their first major trophy, Euro 2016, despite going off injured in the final.",
      "One of only two players, alongside Messi, to win the Ballon d'Or five or more times.",
    ],
    decoys: ["Lionel Messi", "Kylian Mbappé", "Karim Benzema", "Luís Figo", "Robert Lewandowski", "Neymar"],
  },
  {
    name: "Zico",
    clues: [
      "Was considered too small and physically weak as a teenager, requiring an intensive fitness regimen before Flamengo would fully commit to him.",
      "Starred for Flamengo before a later spell in Italy with Udinese.",
      "Wore the number 10 for Brazil's celebrated but ultimately unsuccessful 1982 World Cup squad, considered one of the greatest teams never to win the tournament.",
      "Later helped popularize football at Kashima Antlers in Japan, becoming a hugely influential figure there.",
      "One of Brazil's greatest playmakers never to lift the World Cup, despite multiple South American Footballer of the Year awards.",
    ],
    decoys: ["Sócrates", "Falcão", "Careca", "Ronaldinho", "Romário", "Rivaldo"],
  },
  {
    name: "Sócrates",
    clues: [
      "Started out at the smaller São Paulo state club Botafogo-SP, and briefly considered quitting football altogether to practice medicine full-time.",
      "Known for his elegant backheel goals and flicks.",
      "Captained Brazil's stylish 1982 World Cup team, eliminated by Italy in a classic match.",
      "A key figure in the 'Corinthians Democracy' movement, giving players a democratic voice in club decisions during Brazil's military dictatorship era.",
      "Tall, bearded Brazilian midfielder considered one of the most cerebral players of his generation.",
    ],
    decoys: ["Zico", "Falcão", "Toninho Cerezo", "Kaká", "Rivelino", "Gérson"],
  },
  {
    name: "Gianluigi Buffon",
    clues: [
      "Made his Serie A debut for Parma as a 17-year-old in 1995, against AC Milan, keeping a clean sheet in a scoreless draw.",
      "Was transferred to Juventus in 2001 for a fee that remains one of the most expensive ever paid for a goalkeeper.",
      "Won the World Cup with Italy in 2006, conceding only two goals — an own goal and a penalty — across the entire tournament.",
      "Played competitively into his mid-40s, remarkable longevity for a top-flight goalkeeper.",
      "Long-time Juventus and Italy number one, widely considered one of the greatest goalkeepers ever despite never winning the Champions League.",
    ],
    decoys: ["Iker Casillas", "Gianluca Pagliuca", "Dino Zoff", "Lev Yashin", "Peter Schmeichel", "Manuel Neuer"],
  },
  {
    name: "Iker Casillas",
    clues: [
      "Became Real Madrid's first-choice goalkeeper as a teenager, playing in the 2000 Champions League final aged just 19.",
      "Nicknamed 'San Iker' (Saint Iker) by Real Madrid fans for his spectacular saves.",
      "Made a famous stretching save to deny the Netherlands' Arjen Robben late in the 2010 World Cup final.",
      "Captained Spain through their most successful era, winning the World Cup and two European Championships.",
      "Spain and Real Madrid's long-time number one, widely regarded as one of the greatest goalkeepers of his generation.",
    ],
    decoys: ["Gianluigi Buffon", "Víctor Valdés", "David de Gea", "Peter Schmeichel", "Dino Zoff", "Manuel Neuer"],
  },
  {
    name: "David Beckham",
    clues: [
      "Wore the number 28 shirt in Manchester United's reserve team before later making number 7 his own.",
      "Scored from inside his own half against Wimbledon in 1996, an early sign of his famous range of passing.",
      "Curled a famous last-minute free kick against Greece in 2001 to send England to the World Cup.",
      "Later moved to Real Madrid as part of their 'Galácticos' era, then to LA Galaxy to help popularize football in the United States.",
      "Won the treble — league, FA Cup, and Champions League — with Manchester United in 1999.",
    ],
    decoys: ["Steven Gerrard", "Ryan Giggs", "Paul Scholes", "Frank Lampard", "Luís Figo", "Robert Pirès"],
  },
  {
    name: "Steven Gerrard",
    clues: [
      "Came through Liverpool's youth academy and made his debut in 1998.",
      "Scored a thunderous long-range strike to spark Liverpool's comeback in the 2006 FA Cup final.",
      "Captained Liverpool's astonishing comeback from 3-0 down at half-time to win the 2005 Champions League final on penalties.",
      "Spent his entire career at Liverpool before a final chapter in Major League Soccer.",
      "Widely regarded as one of the greatest Premier League midfielders never to win the league title with his boyhood club.",
    ],
    decoys: ["Frank Lampard", "Paul Scholes", "Xabi Alonso", "David Beckham", "Andrea Pirlo", "Roy Keane"],
  },
  {
    name: "Frank Lampard",
    clues: [
      "Began his career at West Ham United, where his father was a club legend and assistant manager, and manager Harry Redknapp was his uncle.",
      "Renowned for his ability to arrive late into the box and score from midfield, a rare skill for his position.",
      "Became Chelsea's all-time record goalscorer, a record that has stood since 2013.",
      "Scored a penalty in the shootout as Chelsea won the 2012 Champions League final against Bayern Munich.",
      "Later returned to manage Chelsea and other clubs after retiring as a player.",
    ],
    decoys: ["Steven Gerrard", "Michael Essien", "Joe Cole", "Paul Scholes", "David Beckham", "Xabi Alonso"],
  },
  {
    name: "Ryan Giggs",
    clues: [
      "Was born Ryan Wilson, and played schoolboy football under that name before later adopting his mother's maiden name.",
      "Played in every single season of the Premier League from its very first, 1992-93, until his retirement.",
      "Won more top-flight English league titles than any player in history, all with the same club.",
      "Renowned as one of the most gifted wingers of his generation, known for his dribbling and longevity.",
      "Manchester United's record appearance holder, playing for the club for over two decades.",
    ],
    decoys: ["Paul Scholes", "David Beckham", "Andrei Kanchelskis", "Robert Pirès", "Luís Figo", "Denis Law"],
  },
  {
    name: "Andrea Pirlo",
    clues: [
      "Was repositioned from an attacking midfielder into a deep-lying playmaker role early in his career, reinventing how the position was played.",
      "Set up both of Italy's goals in the dramatic 2006 World Cup semi-final win over Germany.",
      "Scored an audacious 'Panenka' style penalty against England at Euro 2012.",
      "Left AC Milan on a free transfer in his 30s and went on to inspire renewed success at Juventus.",
      "Renowned for his calm passing range and vision, redefining the deep playmaker role for a generation.",
    ],
    decoys: ["Xabi Alonso", "Sergio Busquets", "Daniele De Rossi", "Claude Makélélé", "Xavi Hernández", "Steven Gerrard"],
  },
  {
    name: "Fabio Cannavaro",
    clues: [
      "Began his career at Napoli before moves to Parma and later Inter Milan.",
      "Captained Italy to World Cup glory in 2006, marshalling a famously tough defense that conceded just two goals all tournament.",
      "Became just one of a handful of defenders ever to win the Ballon d'Or, in 2006.",
      "Spent his peak years at Real Madrid after the 2006 World Cup.",
      "The first, and so far only, Italian to be named FIFA World Player of the Year, in 2006.",
    ],
    decoys: ["Alessandro Nesta", "Paolo Maldini", "Marco Materazzi", "Franz Beckenbauer", "Bobby Moore", "Franco Baresi"],
  },
  {
    name: "Luís Figo",
    clues: [
      "Rose to prominence at Sporting CP before a move to Barcelona in the mid-1990s.",
      "His controversial 2000 transfer to fierce rivals Real Madrid, for what was then a world record fee, made him deeply unpopular in Catalonia.",
      "Was famously pelted with objects — including a pig's head — by Barcelona fans on his return to the Camp Nou.",
      "Won the Ballon d'Or in 2000, the same year as his controversial transfer.",
      "Portuguese winger renowned for his crossing and dribbling, later a key figure in Portugal's golden generation.",
    ],
    decoys: ["Cristiano Ronaldo", "Rui Costa", "Eusébio", "David Beckham", "Robert Pirès", "Zinedine Zidane"],
  },
  {
    name: "Raúl",
    clues: [
      "Joined Real Madrid's youth academy after Atlético Madrid controversially disbanded their youth teams in the early 1990s.",
      "Became Real Madrid's youngest-ever captain at the time.",
      "Held the record as the UEFA Champions League's all-time top scorer for over a decade.",
      "Was Real Madrid's all-time leading goalscorer for years before later being surpassed.",
      "Spent 16 seasons as one of Real Madrid's most iconic forwards, adored by fans at the Santiago Bernabéu.",
    ],
    decoys: ["Fernando Torres", "Fernando Morientes", "David Villa", "Alan Shearer", "Thierry Henry", "Ronaldo Nazário"],
  },
  {
    name: "Alan Shearer",
    clues: [
      "Scored a hat-trick on his full debut for Southampton as a 17-year-old in 1988.",
      "Became the first player to score 30 or more goals in three consecutive Premier League seasons.",
      "Turned down a move to Manchester United to join his boyhood club, Newcastle United, for a world record transfer fee in 1996.",
      "Remains the Premier League's all-time record goalscorer.",
      "Renowned English striker known for his powerful shooting and celebratory single-arm-raised goal celebration.",
    ],
    decoys: ["Michael Owen", "Wayne Rooney", "Andy Cole", "Ian Rush", "Gary Lineker", "Robbie Fowler"],
  },
  {
    name: "Neymar",
    clues: [
      "Was already earning significant sponsorship money by his mid-teens in Brazil, well before his big-money move to Europe.",
      "Scored the decisive penalty as Brazil won Olympic gold on home soil in 2016.",
      "Formed the 'MSN' attacking trio with Messi and Suárez at Barcelona.",
      "His 2017 transfer to Paris Saint-Germain shattered the world transfer record by a huge margin.",
      "Brazil's talisman forward known for his flair, dribbling, and theatrical reactions to fouls.",
    ],
    decoys: ["Ronaldinho", "Kaká", "Gabriel Jesus", "Rivaldo", "Romário", "Vinícius Júnior"],
  },
];
