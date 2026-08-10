// Football trivia + "Guess the Footballer" content. Deliberately hand-curated
// from well-established, historical facts (not recent/live stats) so nothing
// here goes stale or depends on results after this was written.

window.TRIVIA_QUESTIONS = [
  {
    q: "Which club did a 13-year-old Lionel Messi join, moving from Argentina to Spain, after Newell's Old Boys?",
    choices: ["Real Madrid", "Barcelona", "Atlético Madrid", "Espanyol"],
    correct: 1,
  },
  {
    q: "Which country lost the very first World Cup final, in 1930?",
    choices: ["Brazil", "Argentina", "Uruguay", "Chile"],
    correct: 1,
  },
  {
    q: "Who is the only person to have won the World Cup as both captain and head coach?",
    choices: ["Franz Beckenbauer", "Mario Zagallo", "Didier Deschamps", "Zinedine Zidane"],
    correct: 0,
  },
  {
    q: "Real Madrid won every European Cup from the competition's 1956 launch through which year, five in a row?",
    choices: ["1958", "1959", "1960", "1961"],
    correct: 2,
  },
  {
    q: "In what year was the offside law changed from requiring three defenders between attacker and goal down to two?",
    choices: ["1912", "1925", "1938", "1949"],
    correct: 1,
  },
  {
    q: "Which country won the first-ever European Championship, in 1960?",
    choices: ["West Germany", "Soviet Union", "Yugoslavia", "Czechoslovakia"],
    correct: 1,
  },
  {
    q: "Who was sent off after just 56 seconds — the fastest red card in a World Cup final — in 1986?",
    choices: ["Diego Maradona", "José Batista", "Harald Schumacher", "Lothar Matthäus"],
    correct: 1,
  },
  {
    q: "Which two clubs met in the first-ever European Cup final in 1956?",
    choices: [
      "Real Madrid & AC Milan",
      "Real Madrid & Stade de Reims",
      "Benfica & Real Madrid",
      "Honvéd & Real Madrid",
    ],
    correct: 1,
  },
  {
    q: "After winning the 2024 Copa América, which country holds the outright record for most Copa América titles?",
    choices: ["Uruguay", "Brazil", "Argentina", "Chile"],
    correct: 2,
  },
  {
    q: "Who managed the Netherlands' 'Total Football' side at the 1974 World Cup?",
    choices: ["Johan Cruyff", "Rinus Michels", "Guus Hiddink", "Louis van Gaal"],
    correct: 1,
  },
  {
    q: "Which stadium hosted the famous 1950 World Cup deciding match known as the 'Maracanazo'?",
    choices: ["Estádio do Pacaembu", "Estádio Mineirão", "Maracanã Stadium", "Estádio da Luz"],
    correct: 2,
  },
  {
    q: "Alfredo Di Stéfano played full international football for three different countries. Argentina and Spain were two — what's the third?",
    choices: ["Uruguay", "Colombia", "Chile", "Peru"],
    correct: 1,
  },
  {
    q: "Which English club did Brian Clough manage to back-to-back European Cup titles, in 1979 and 1980?",
    choices: ["Derby County", "Leeds United", "Nottingham Forest", "Aston Villa"],
    correct: 2,
  },
  {
    q: "What nickname is given to the fixture between Barcelona and Real Madrid?",
    choices: ["El Derbi", "El Clásico", "La Liga Grande", "El Superclásico"],
    correct: 1,
  },
  {
    q: "Which goalkeeper became a penalty-shootout hero for Argentina at the 1990 World Cup, saving key spot-kicks in both the quarter-final and semi-final?",
    choices: ["Sergio Goycochea", "Nery Pumpido", "Carlos Roa", "Ubaldo Fillol"],
    correct: 0,
  },
  {
    q: "Which country did West Germany beat in the 1954 World Cup final, an upset remembered as the 'Miracle of Bern'?",
    choices: ["Hungary", "Austria", "Uruguay", "Yugoslavia"],
    correct: 0,
  },
];

// ── Guess the Footballer ────────────────────────────────────
// clues[] run from most obscure (revealed first) to most obvious (revealed
// last) — guessing correctly on fewer clues scores more points.
window.GUESS_PLAYERS = [
  {
    name: "Diego Maradona",
    clues: [
      "Left out of his country's World Cup-winning squad in 1978 for being considered too young, despite already being a first-team pro at 17.",
      "Signed for Napoli in 1984 for what was then a world record transfer fee.",
      "Scored two of the most talked-about goals in World Cup history in the same match, four minutes apart.",
      "Captained his country to World Cup glory in 1986.",
      "Argentine number 10, widely ranked alongside Pelé as the greatest player ever.",
    ],
    decoys: ["Pelé", "Zinedine Zidane", "Ronaldinho"],
  },
  {
    name: "Johan Cruyff",
    clues: [
      "Wore the number 14 shirt — unusual for an attacker in his era, when stars wore single digits.",
      "Won the Ballon d'Or three times in the 1970s.",
      "Has a famous piece of ball-control skill named after him, first seen at the 1974 World Cup.",
      "Starred for Ajax before Barcelona, then later managed Barcelona to their first-ever European Cup.",
      "Dutch icon of 'Total Football' who never won a World Cup himself, losing the 1974 final.",
    ],
    decoys: ["Franz Beckenbauer", "Marco van Basten", "Ruud Gullit"],
  },
  {
    name: "Franz Beckenbauer",
    clues: [
      "Pioneered the attacking sweeper role, known in German as 'libero', in the late 1960s.",
      "Nicknamed 'Der Kaiser'.",
      "Won the Ballon d'Or twice, in 1972 and 1976.",
      "Spent the bulk of his playing career at Bayern Munich.",
      "One of only two people to win the World Cup as both captain and head coach.",
    ],
    decoys: ["Lothar Matthäus", "Franco Baresi", "Paolo Maldini"],
  },
  {
    name: "Zinedine Zidane",
    clues: [
      "Grew up in a tough neighborhood of Marseille and began his professional career at Cannes.",
      "Won the Ballon d'Or in 1998.",
      "Scored two headers in a World Cup final to help his country win their first title.",
      "Sent off in the 2006 World Cup final for a headbutt on Marco Materazzi.",
      "Later managed Real Madrid to three consecutive Champions League titles, from 2016 to 2018.",
    ],
    decoys: ["Michel Platini", "Thierry Henry", "Ronaldinho"],
  },
  {
    name: "Ronaldinho",
    clues: [
      "Scored on his senior international debut for Brazil in 1999.",
      "Scored an audacious free kick against England at the 2002 World Cup that goalkeeper David Seaman never saw coming.",
      "Won back-to-back FIFA World Player of the Year awards in 2004 and 2005.",
      "Known for his permanent grin and elaborate skills while starring for Barcelona in the mid-2000s.",
      "Won the World Cup with Brazil in 2002.",
    ],
    decoys: ["Kaká", "Ronaldo Nazário", "Rivaldo"],
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
    decoys: ["Denis Law", "Bobby Charlton", "Ryan Giggs"],
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
    decoys: ["Zinedine Zidane", "Marco van Basten", "Roberto Baggio"],
  },
  {
    name: "Paolo Maldini",
    clues: [
      "Made his Serie A debut at just 16 years old, in 1985.",
      "Played his entire senior career at a single club, across 25 seasons.",
      "Renowned as one of the greatest defenders ever, despite rarely making crunching tackles.",
      "Scored after just 51 seconds in a Champions League final — still the competition's fastest final goal.",
      "Followed his father Cesare into the AC Milan captaincy, and his own son later played for Milan too.",
    ],
    decoys: ["Franco Baresi", "Alessandro Nesta", "Fabio Cannavaro"],
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
    decoys: ["Diego Maradona", "Ronaldo Nazário", "Garrincha"],
  },
  {
    name: "Lev Yashin",
    clues: [
      "Nicknamed the 'Black Spider' for his all-black kit and spectacular reflex saves.",
      "Remains the only goalkeeper ever to win the Ballon d'Or, in 1963.",
      "Played his entire career for a single club, Dynamo Moscow.",
      "Credited with pioneering the modern goalkeeping style of commanding the box and organizing the defense.",
      "Soviet goalkeeper widely considered the greatest of all time.",
    ],
    decoys: ["Gordon Banks", "Dino Zoff", "Peter Schmeichel"],
  },
  {
    name: "Eusébio",
    clues: [
      "Born in Mozambique, then a Portuguese colony, and discovered playing for a local club before moving to Europe.",
      "Nicknamed the 'Black Panther'.",
      "Top scorer at the 1966 World Cup with 9 goals, despite his country not reaching the final.",
      "Won the Ballon d'Or in 1965 while playing for Benfica.",
      "Portugal's all-time record goalscorer for decades, and Benfica's greatest-ever player.",
    ],
    decoys: ["Luís Figo", "Cristiano Ronaldo", "Rui Costa"],
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
    decoys: ["Bobby Charlton", "Geoff Hurst", "Terry Butcher"],
  },
  {
    name: "Marco van Basten",
    clues: [
      "Scored a famous volleyed goal from an almost impossible angle in a major international final in 1988.",
      "Won the Ballon d'Or three times, in 1988, 1989, and 1992.",
      "His career was cut short in his late 20s by chronic ankle injuries.",
      "Starred for AC Milan alongside fellow Dutchmen Frank Rijkaard and Ruud Gullit.",
      "Part of the Dutch side, captained by Ruud Gullit, that won the Netherlands' only major trophy at Euro 1988.",
    ],
    decoys: ["Ruud Gullit", "Dennis Bergkamp", "Johan Cruyff"],
  },
  {
    name: "Roberto Baggio",
    clues: [
      "Nicknamed 'Il Divin Codino' (the Divine Ponytail) for his distinctive hairstyle.",
      "Won the Ballon d'Or in 1993.",
      "Scored a famous solo goal weaving past multiple defenders at the 1990 World Cup.",
      "Missed the decisive penalty in the shootout of the 1994 World Cup final, an infamous moment in Italian football.",
      "Devout Buddhist and one of Italy's most beloved players despite the 1994 final heartbreak.",
    ],
    decoys: ["Alessandro Del Piero", "Francesco Totti", "Gianfranco Zola"],
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
    decoys: ["Ferenc Puskás", "Raúl", "Cristiano Ronaldo"],
  },
  {
    name: "Ferenc Puskás",
    clues: [
      "Nicknamed the 'Galloping Major' due to his rank in the Hungarian army football team.",
      "Star forward of Hungary's 'Mighty Magyars', who inflicted England's first-ever home defeat to opposition from outside the British Isles in 1953.",
      "Fled Hungary after the 1956 revolution and eventually joined Real Madrid.",
      "Formed a devastating attacking partnership with Alfredo Di Stéfano at Real Madrid.",
      "FIFA later named an award for the best goal of the year after him.",
    ],
    decoys: ["Alfredo Di Stéfano", "Sándor Kocsis", "Nándor Hidegkuti"],
  },
  {
    name: "Gerd Müller",
    clues: [
      "Nicknamed 'Der Bomber' for his prolific, instinctive finishing inside the penalty box.",
      "Scored the winning goal in the 1974 World Cup final for West Germany.",
      "Held the record for most goals in a single Bundesliga season for decades.",
      "Spent almost his entire career at Bayern Munich, alongside Franz Beckenbauer.",
      "One of the most prolific goalscorers in football history relative to games played.",
    ],
    decoys: ["Franz Beckenbauer", "Karl-Heinz Rummenigge", "Jürgen Klinsmann"],
  },
  {
    name: "Andrés Iniesta",
    clues: [
      "Made his senior Barcelona debut in 2002 after progressing through La Masia, the club's youth academy.",
      "Scored the extra-time winning goal in the 2010 World Cup final for Spain.",
      "Formed one of the most celebrated central-midfield partnerships in history alongside a teammate with the same first initial.",
      "Won the World Cup (2010) and two European Championships (2008, 2012) with Spain's dominant 'tiki-taka' generation.",
      "Spent almost his entire senior career at Barcelona, admired for his elegant dribbling and vision.",
    ],
    decoys: ["Xavi Hernández", "Cesc Fàbregas", "David Silva"],
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
    decoys: ["Andrés Iniesta", "Sergio Busquets", "Xabi Alonso"],
  },
  {
    name: "Thierry Henry",
    clues: [
      "Began his career as a winger at Monaco under manager Arsène Wenger before being converted into a striker.",
      "Won the World Cup with France in 1998, though used mainly as a squad player at the tournament.",
      "Became Arsenal's all-time record goalscorer, a record that stood for over a decade.",
      "Key member of Arsenal's 'Invincibles' side that went unbeaten through an entire Premier League season.",
      "Widely regarded as one of the greatest Premier League players ever, known for his pace and clinical finishing.",
    ],
    decoys: ["Dennis Bergkamp", "Robert Pirès", "Patrick Vieira"],
  },
  {
    name: "Ronaldo Nazário",
    clues: [
      "Nicknamed 'O Fenômeno' (the Phenomenon) for his explosive pace and skill as a teenager.",
      "Suffered a mysterious seizure hours before the 1998 World Cup final, playing in a below-par performance as his team lost.",
      "Overcame serious knee injuries that threatened to end his career in the early 2000s.",
      "Top scorer at the 2002 World Cup with 8 goals as his country won the title.",
      "Won the FIFA World Player of the Year award three times.",
    ],
    decoys: ["Ronaldinho", "Rivaldo", "Romário"],
  },
  {
    name: "Roberto Carlos",
    clues: [
      "Began his career at Palmeiras in Brazil before a brief, unsuccessful spell at Inter Milan.",
      "Famous for a swerving 1997 free kick against France that appeared to defy physics.",
      "Renowned as one of the most attacking left-backs in history, bombing forward from defense constantly.",
      "Spent over a decade as a key part of Real Madrid's 'Galácticos' era.",
      "Won the World Cup with Brazil in 2002.",
    ],
    decoys: ["Cafu", "Marcelo", "Dani Alves"],
  },
  {
    name: "Cafu",
    clues: [
      "Nicknamed 'O Pendulino' (the Little Pendulum) for his relentless up-and-down running on the right flank.",
      "The only player to appear in three consecutive World Cup finals: 1994, 1998, and 2002.",
      "Captained his country to World Cup glory in 2002.",
      "Formed a famous attacking full-back partnership with Roberto Carlos for the national team.",
      "Won Serie A titles with both Roma and AC Milan, and a Champions League with Milan.",
    ],
    decoys: ["Roberto Carlos", "Dani Alves", "Lilian Thuram"],
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
    decoys: ["Samuel Eto'o", "Yaya Touré", "Nicolas Anelka"],
  },
];
