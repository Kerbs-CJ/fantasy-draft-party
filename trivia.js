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
];
