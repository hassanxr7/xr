/* Demo Betting — sports, leagues and teams used by the match simulator.
 *
 * Sport fields:
 *   kind      'goals' (score counts, Poisson model) or 'sets' (best-of-N sets)
 *   n         how many not-yet-finished events to keep on the board
 *   win       new events start between now and now + win minutes
 *   goals:    dur (match minutes), realMin (real minutes a match takes), periods,
 *             total [min,max] expected total score, threeWay (draw possible),
 *             adv/k/cap tune the home/away score split from team ratings,
 *             lines/main/hcp fixed lines, or step/hcpStep for per-event lines
 *   sets:     bestOf, target (points/games to win a set), lastTarget (deciding set),
 *             setMin (real minutes per set), deuce (chance a set goes past target)
 * League teams are listed roughly strongest first; ratings are derived from position.
 */
'use strict';
(function () {
  const DB = window.DB;

  DB.SPORTS = [
    { id: 'football', icon: '⚽', kind: 'goals', threeWay: true, dur: 90, realMin: 8, periods: 2, n: 26, win: 40,
      total: [2.2, 3.2], adv: 0.04, k: 0.2, cap: 0.32,
      lines: [0.5, 1.5, 2.5, 3.5, 4.5], main: 2.5, hcp: [-1.5, -0.5, 0.5, 1.5], teamLines: [0.5, 1.5, 2.5],
      btts: true, cs: 3, nextGoal: true },
    { id: 'basketball', icon: '🏀', kind: 'goals', threeWay: false, dur: 48, realMin: 7, periods: 4, n: 10, win: 30,
      total: [204, 236], adv: 0.01, k: 0.045, cap: 0.08, step: 5, hcpStep: 3 },
    { id: 'tennis', icon: '🎾', kind: 'sets', bestOf: 3, target: 6, setMin: 2.2, n: 10, win: 25 },
    { id: 'ice_hockey', icon: '🏒', kind: 'goals', threeWay: true, dur: 60, realMin: 6, periods: 3, n: 8, win: 30,
      total: [5.0, 6.6], adv: 0.03, k: 0.14, cap: 0.25,
      lines: [3.5, 4.5, 5.5, 6.5, 7.5], main: 5.5, hcp: [-1.5, 1.5], teamLines: [1.5, 2.5, 3.5],
      btts: true, cs: 4, nextGoal: true },
    { id: 'volleyball', icon: '🏐', kind: 'sets', bestOf: 5, target: 25, lastTarget: 15, setMin: 1.6, deuce: 0.16, n: 6, win: 25 },
    { id: 'table_tennis', icon: '🏓', kind: 'sets', bestOf: 5, target: 11, setMin: 0.9, deuce: 0.2, n: 8, win: 22 },
    { id: 'esports', icon: '🎮', kind: 'sets', bestOf: 3, target: 13, setMin: 2.4, deuce: 0.14, n: 8, win: 30 },
    { id: 'handball', icon: '🤾', kind: 'goals', threeWay: true, dur: 60, realMin: 6, periods: 2, n: 5, win: 30,
      total: [52, 62], adv: 0.015, k: 0.07, cap: 0.12, step: 2, hcpStep: 2 },
  ];

  DB.LEAGUES = [
    // Football
    { id: 'eng', sport: 'football', cc: 'ENG', name: 'England. Premier League', w: 4, top: true,
      teams: ['Manchester City', 'Arsenal', 'Liverpool', 'Chelsea', 'Manchester United', 'Tottenham', 'Newcastle', 'Aston Villa', 'Brighton', 'West Ham', 'Fulham', 'Everton'] },
    { id: 'som', sport: 'football', cc: 'SOM', name: 'Somalia. Premier League', w: 3, top: true,
      teams: ['Elman', 'Horseed', 'Dekedda', 'Heegan', 'Mogadishu City', 'Gaadiidka', 'Jeenyo United', 'Badbaado'] },
    { id: 'esp', sport: 'football', cc: 'ESP', name: 'Spain. LaLiga', w: 3, top: true,
      teams: ['Real Madrid', 'Barcelona', 'Atletico Madrid', 'Athletic Bilbao', 'Real Sociedad', 'Villarreal', 'Real Betis', 'Sevilla', 'Girona', 'Valencia'] },
    { id: 'ucl', sport: 'football', cc: 'EUR', name: 'UEFA Champions League', w: 3, top: true,
      teams: ['Real Madrid', 'Manchester City', 'Bayern Munich', 'PSG', 'Barcelona', 'Inter', 'Arsenal', 'Liverpool', 'Atletico Madrid', 'Benfica', 'Porto', 'Celtic'] },
    { id: 'ita', sport: 'football', cc: 'ITA', name: 'Italy. Serie A', w: 3,
      teams: ['Inter', 'Napoli', 'Juventus', 'AC Milan', 'Atalanta', 'Roma', 'Lazio', 'Fiorentina', 'Bologna', 'Torino'] },
    { id: 'ger', sport: 'football', cc: 'GER', name: 'Germany. Bundesliga', w: 2,
      teams: ['Bayern Munich', 'Bayer Leverkusen', 'Borussia Dortmund', 'RB Leipzig', 'Stuttgart', 'Eintracht Frankfurt', 'Freiburg', 'Wolfsburg'] },
    { id: 'fra', sport: 'football', cc: 'FRA', name: 'France. Ligue 1', w: 2,
      teams: ['PSG', 'Monaco', 'Marseille', 'Lille', 'Lyon', 'Nice', 'Lens', 'Rennes'] },
    { id: 'ksa', sport: 'football', cc: 'KSA', name: 'Saudi Arabia. Pro League', w: 2,
      teams: ['Al Hilal', 'Al Nassr', 'Al Ittihad', 'Al Ahli', 'Al Shabab', 'Al Ettifaq', 'Al Taawoun', 'Al Fateh'] },
    { id: 'caf', sport: 'football', cc: 'CAF', name: 'Africa. CAF Champions League', w: 2,
      teams: ['Al Ahly', 'Mamelodi Sundowns', 'Esperance', 'Wydad', 'Raja Casablanca', 'TP Mazembe', 'Simba SC', 'Young Africans'] },
    { id: 'egy', sport: 'football', cc: 'EGY', name: 'Egypt. Premier League', w: 1,
      teams: ['Zamalek', 'Pyramids', 'Al Masry', 'Future FC', 'Ismaily', 'Smouha'] },
    { id: 'por', sport: 'football', cc: 'POR', name: 'Portugal. Primeira Liga', w: 1,
      teams: ['Sporting CP', 'Braga', 'Vitoria Guimaraes', 'Boavista', 'Famalicao', 'Rio Ave'] },
    { id: 'ned', sport: 'football', cc: 'NED', name: 'Netherlands. Eredivisie', w: 1,
      teams: ['PSV', 'Ajax', 'Feyenoord', 'AZ Alkmaar', 'Twente', 'Utrecht'] },

    // Basketball
    { id: 'nba', sport: 'basketball', cc: 'USA', name: 'USA. NBA', w: 3, top: true,
      teams: ['Boston Celtics', 'Oklahoma City Thunder', 'Denver Nuggets', 'Cleveland Cavaliers', 'Minnesota Timberwolves', 'New York Knicks', 'Milwaukee Bucks', 'Dallas Mavericks', 'Phoenix Suns', 'LA Lakers', 'Golden State Warriors', 'Miami Heat', 'Indiana Pacers', 'Philadelphia 76ers'] },
    { id: 'eul', sport: 'basketball', cc: 'EUR', name: 'Europe. EuroLeague', w: 2,
      teams: ['Real Madrid', 'Panathinaikos', 'Olympiacos', 'Fenerbahce', 'Monaco', 'Barcelona', 'Anadolu Efes', 'Partizan', 'Zalgiris', 'Virtus Bologna'] },

    // Tennis
    { id: 'atp', sport: 'tennis', cc: 'ATP', name: 'ATP. Tour', w: 3, top: true,
      teams: ['Sinner J.', 'Alcaraz C.', 'Djokovic N.', 'Zverev A.', 'Fritz T.', 'Medvedev D.', 'Draper J.', 'De Minaur A.', 'Ruud C.', 'Rune H.', 'Rublev A.', 'Paul T.', 'Tsitsipas S.', 'Hurkacz H.'] },
    { id: 'wta', sport: 'tennis', cc: 'WTA', name: 'WTA. Tour', w: 2,
      teams: ['Sabalenka A.', 'Swiatek I.', 'Gauff C.', 'Rybakina E.', 'Pegula J.', 'Paolini J.', 'Andreeva M.', 'Zheng Q.', 'Navarro E.', 'Keys M.', 'Badosa P.', 'Muchova K.'] },

    // Ice hockey
    { id: 'nhl', sport: 'ice_hockey', cc: 'USA', name: 'USA. NHL', w: 3, top: true,
      teams: ['Florida Panthers', 'Edmonton Oilers', 'Dallas Stars', 'Winnipeg Jets', 'Colorado Avalanche', 'Carolina Hurricanes', 'Vegas Golden Knights', 'New York Rangers', 'Toronto Maple Leafs', 'Tampa Bay Lightning', 'Boston Bruins', 'Vancouver Canucks'] },
    { id: 'khl', sport: 'ice_hockey', cc: 'KHL', name: 'KHL', w: 1,
      teams: ['CSKA Moscow', 'SKA St. Petersburg', 'Ak Bars Kazan', 'Lokomotiv', 'Metallurg', 'Dynamo Moscow'] },

    // Volleyball
    { id: 'vita', sport: 'volleyball', cc: 'ITA', name: 'Italy. SuperLega', w: 2, top: true,
      teams: ['Perugia', 'Trentino', 'Lube Civitanova', 'Piacenza', 'Modena', 'Milano', 'Monza', 'Verona'] },
    { id: 'vpol', sport: 'volleyball', cc: 'POL', name: 'Poland. PlusLiga', w: 1,
      teams: ['Jastrzebski', 'ZAKSA', 'Warta Zawiercie', 'Resovia', 'Projekt Warszawa', 'Skra Belchatow'] },

    // Table tennis (fictional players)
    { id: 'tte', sport: 'table_tennis', cc: 'INT', name: 'International. TT Elite Series', w: 1, top: true,
      teams: ['Kovac M.', 'Petrov S.', 'Novak J.', 'Horvat L.', 'Sokolov A.', 'Marin D.', 'Weber K.', 'Silva R.', 'Nagy B.', 'Lund E.', 'Okafor C.', 'Haddad Y.', 'Tanaka R.', 'Park J.', 'Rossi G.', 'Varga P.'] },

    // Esports
    { id: 'cs2', sport: 'esports', cc: 'CS2', name: 'Counter-Strike 2. Pro League', w: 2, top: true,
      teams: ['Vitality', 'Natus Vincere', 'MOUZ', 'Spirit', 'FaZe', 'The MongolZ', 'G2', 'Aurora', 'FURIA', 'Liquid', 'Astralis', 'Heroic'] },
    { id: 'val', sport: 'esports', cc: 'VAL', name: 'Valorant. Champions Tour', w: 1,
      teams: ['Fnatic', 'Sentinels', 'Paper Rex', 'Team Heretics', 'LOUD', 'G2 Esports', 'EDward Gaming', 'DRX'] },

    // Handball
    { id: 'ehf', sport: 'handball', cc: 'EUR', name: 'Europe. EHF Champions League', w: 1, top: true,
      teams: ['Barcelona', 'Magdeburg', 'Aalborg', 'Veszprem', 'Kiel', 'PSG', 'Fuchse Berlin', 'Kielce', 'Szeged', 'Sporting CP'] },
  ];
})();
