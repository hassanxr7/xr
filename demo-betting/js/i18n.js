/* Demo Betting — English (default) and Somali text, plus label helpers for markets, odds and clocks. */
'use strict';
(function () {
  const DB = window.DB;
  const U = DB.U;

  const D = {
    en: {
      brand: 'Demo Betting',
      close: 'Close',
      demo_ribbon: 'DEMO — simulated matches and virtual coins. No real money, no real payouts.',
      play_resp: '18+ · Play responsibly',
      // nav
      nav_home: 'Home', nav_sports: 'Sports', nav_live: 'Live', nav_esports: 'Esports', nav_casino: 'Casino',
      nav_crash: 'Crash', nav_results: 'Results', nav_promo: 'Promotions', nav_mybets: 'My bets', nav_account: 'Account',
      nav_menu: 'Menu', nav_slip: 'Bet slip', nav_info: 'About the demo',
      login: 'Log in', register: 'Registration', logout: 'Log out', deposit: 'Deposit',
      balance: 'Balance', coins: 'DC', coins_long: 'demo coins',
      lang_label: 'Language', theme_label: 'Theme', theme_auto: 'System', theme_dark: 'Dark', theme_light: 'Light',
      odds_fmt: 'Odds format', fmt_dec: 'Decimal (1.85)', fmt_frac: 'Fractional (17/20)', fmt_us: 'American (-118)',
      // sports
      sp_football: 'Football', sp_basketball: 'Basketball', sp_tennis: 'Tennis', sp_ice_hockey: 'Ice Hockey',
      sp_volleyball: 'Volleyball', sp_table_tennis: 'Table Tennis', sp_esports: 'Esports', sp_handball: 'Handball',
      search_ph: 'Search team or league', search_title: 'Search: “{q}”', search_none: 'No events match “{q}”.',
      all: 'All', live: 'Live', upcoming: 'Upcoming', top_leagues: 'Top leagues', sports_list: 'Sports',
      top_live: 'Top live', top_upcoming: 'Starting soon', see_all: 'See all',
      live_now: 'Live now', no_live: 'No live events in this sport right now. New matches kick off every few minutes.',
      no_upcoming: 'No upcoming events here right now.', within: 'Next {n} min',
      in_min: 'in {n} min', starts_now: 'starting', finished: 'Finished', today: 'Today',
      half: '{o} half', quarter: 'Q{n}', period: '{o} period', set_n: 'Set {n}', map_n: 'Map {n}', break: 'Break',
      all_markets: 'All markets', markets: 'Markets', f_all: 'All', f_main: 'Main', f_totals: 'Totals', f_hcp: 'Handicap', f_score: 'Score',
      total_short: 'Total', hcp_short: 'Hcp', over: 'Over', under: 'Under', yes: 'Yes', no: 'No', draw: 'Draw',
      odd: 'Odd', even: 'Even', other: 'Any other', no_goal: 'No goal',
      m_1x2: 'Match result', m_ml: 'Winner', m_dc: 'Double chance', m_total: 'Total', m_hcp: 'Handicap',
      m_btts: 'Both teams to score', m_tt: 'Total — {team}', m_oe: 'Total odd/even', m_cs: 'Correct score',
      m_ng: 'Goal {n} — who scores?', m_set: '{w} {n} winner', m_sets_total: 'Total {w}s', m_sets_hcp: '{w} handicap',
      w_set: 'Set', w_map: 'Map',
      ev_not_found: 'This event is no longer on the board.', back_home: 'Back to sports',
      ev_finished: 'This event has finished.', final_score: 'Final score', starts_at: 'Starts {d}',
      goals_title: 'Goals', periods_title: 'By period', sets_title: 'Score by {w}', susp: 'Markets paused',
      results_title: 'Results', results_none: 'Finished events will appear here.',
      // slip
      slip: 'Bet slip', my_bets: 'My bets', single: 'Single', acca: 'Accumulator', slip_empty_t: 'Your bet slip is empty',
      slip_empty: 'Tap any odds to add a selection. Combine 2+ events from different matches into an accumulator.',
      stake: 'Stake', total_stake: 'Total stake', total_odds: 'Total odds', pot_win: 'Potential win',
      place_bet: 'Place bet', login_to_bet: 'Log in to bet', clear_all: 'Clear all', remove: 'Remove',
      accept_label: 'Odds changes', accept_any: 'Accept any change', accept_up: 'Accept higher odds', accept_none: 'Ask me first',
      accept_changes: 'Accept changes', odds_changed: 'Odds changed', unavailable: 'Not available',
      conflict: 'Two selections from the same event can\'t be combined.', boost_on: 'Accumulator boost +10% applied',
      boost_hint: 'Add {n} more selection(s) at {o}+ odds for a +10% boost',
      err_min: 'Minimum stake is {n} DC.', err_max: 'Maximum stake is {n} DC.', err_funds: 'Not enough balance. Add demo coins to continue.',
      err_unavail: 'Some selections are no longer available. Remove them to continue.', err_changed: 'Odds changed. Review and accept the new odds.',
      err_stake: 'Enter a stake.', err_acca2: 'An accumulator needs at least 2 selections.',
      bet_ok: 'Bet accepted · #{id}', bets_ok: '{n} bets accepted', max_sel: 'A bet slip can hold up to 20 selections.',
      // my bets
      mb_open: 'Open', mb_settled: 'Settled', mb_all: 'All', mb_none: 'No bets here yet.', mb_none_cta: 'Go to sports',
      st_open: 'Open', st_won: 'Won', st_lost: 'Lost', st_void: 'Refunded', st_cashed: 'Cashed out',
      odds: 'Odds', payout: 'Payout', cashout: 'Cash out', cashout_confirm: 'Confirm {v}', cashed_ok: 'Cashed out {v} DC',
      settled_won: 'Bet #{id} won {v} DC', settled_lost: 'Bet #{id} lost', settled_void: 'Bet #{id} refunded', view_all_bets: 'All my bets',
      // auth
      reg_title: 'Create a demo account', reg_oneclick: 'One-click', reg_username: 'Username',
      username: 'Username', password: 'Password', password2: 'Repeat password',
      age_ok: 'I am 18 or older and understand this is a demo with no real money.',
      demo_store_note: 'Accounts live only in this browser. Don\'t reuse a real password.',
      oneclick_note: 'We\'ll create a username and password for you and add {n} DC welcome coins.',
      oneclick_btn: 'Register in one click', creds_title: 'Your account is ready', creds_note: 'Save these details to log in again on this browser.',
      copy: 'Copy', copied: 'Copied', start_betting: 'Start betting',
      err_name: 'Username: 3–16 letters, numbers or _.', err_pass: 'Password needs at least 4 characters.', err_taken: 'That username is taken on this browser.',
      err_login: 'Wrong username or password.', err_match: 'Passwords don\'t match.', err_age: 'Please confirm you are 18+.',
      welcome: 'Welcome, {name}! {n} DC added to your balance.', logged_in: 'Logged in as {name}', logged_out: 'Logged out',
      need_login: 'Log in or register to place bets.',
      // deposit
      dep_title: 'Add demo coins', dep_note: 'Demo coins have no cash value and can\'t be withdrawn. Top up as often as you like.',
      dep_amount: 'Amount', dep_btn: 'Add {n} DC', dep_ok: '{n} DC added', dep_max: 'Up to 10,000 DC per top-up.',
      withdraw: 'Withdraw', wd_note: 'Withdrawals are switched off: this is a demo and coins are not real money.',
      dep_tab_demo: 'Demo coins',
      sova_note: 'Test payments through the SovaMoney sandbox. No real money moves. Once SovaMoney confirms a payment, the amount is added to your balance as demo coins (1 USD = 1 DC).',
      sova_amount: 'Amount ({c})', sova_name: 'Payer name', sova_email: 'Email',
      sova_test: 'Sandbox test account: {email} · code {code}',
      sova_btn: 'Continue to SovaMoney', sova_redirect: 'Opening SovaMoney…',
      sova_leave: 'You finish the payment on SovaMoney\'s page. Your balance updates after SovaMoney confirms it.',
      sova_off: 'SovaMoney deposits work when the site runs on its own server with the merchant keys set up.',
      sova_checking: 'Checking SovaMoney availability…',
      sova_err_amount: 'Enter an amount between {min} and {max} USD.', sova_err_name: 'Enter a name of up to 30 characters.',
      sova_err_email: 'Enter a valid email of up to 30 characters.', sova_err_start: 'SovaMoney could not start the payment: {m}',
      sova_recent: 'Recent SovaMoney deposits', sova_credited: '{n} DC added from SovaMoney',
      dpst_title: 'SovaMoney deposit', dpst_ref: 'Reference', dpst_amount: 'Amount',
      dpst_pending: 'Waiting for SovaMoney to confirm the payment. This page updates by itself.',
      dpst_confirmed: 'Payment confirmed. {n} DC were added to your balance.',
      dpst_cancelled: 'You cancelled this payment. Your balance is unchanged.',
      dpst_failed: 'SovaMoney did not complete this payment. Your balance is unchanged.',
      dpst_missing: 'This deposit is not linked to your account on this browser.',
      dpst_offline: 'Can\'t reach the server right now. Retrying…', dpst_new: 'New deposit',
      ds_pending: 'Pending', ds_confirmed: 'Confirmed', ds_cancelled: 'Cancelled', ds_failed: 'Failed',
      tx_sova_deposit: 'SovaMoney deposit',
      // account
      acc_profile: 'Profile', acc_history: 'Transactions', acc_settings: 'Settings', member_since: 'Member since {d}',
      stat_bets: 'Bets placed', stat_won: 'Won', stat_lost: 'Lost', stat_staked: 'Staked', stat_returned: 'Returned', stat_profit: 'Profit',
      reset_acc: 'Reset demo account', reset_confirm: 'Reset balance and history?', reset_yes: 'Yes, reset', cancel: 'Cancel', reset_done: 'Account reset. {n} DC added.',
      tx_date: 'Date', tx_type: 'Type', tx_amount: 'Amount', tx_balance: 'Balance', tx_none: 'No transactions yet.',
      tx_deposit: 'Top-up', tx_bonus: 'Bonus', tx_bet: 'Bet', tx_win: 'Win', tx_cashout: 'Cash out', tx_refund: 'Refund',
      tx_casino_bet: 'Casino bet', tx_casino_win: 'Casino win',
      settings_note: 'Settings are saved in this browser.',
      // promo
      promo_title: 'Promotions', promo_welcome_t: 'Welcome bonus', promo_welcome: 'Get {n} DC the moment you register — one click is enough.',
      promo_wheel_t: 'Daily lucky wheel', promo_wheel: 'Spin once every 24 hours for up to 2,000 DC.',
      promo_boost_t: 'Accumulator boost', promo_boost: '+10% on winnings for accumulators with 5+ selections at 1.30+ odds.',
      promo_cash_t: 'Cash out', promo_cash: 'Settle open bets early from My bets, before the final whistle.',
      spin: 'Spin', spin_again: 'Next spin in {t}', spin_win: 'You won {n} DC!', spin_login: 'Log in to spin',
      // home
      hero1_t: '1,000 DC welcome bonus', hero1: 'Register in one click and start with a full wallet of demo coins.',
      hero2_t: 'Live betting', hero2: 'Odds move every few seconds as simulated matches unfold.',
      hero3_t: 'Crash', hero3: 'Watch the multiplier climb. Cash out before it flies away.',
      hero_cta_reg: 'Register', hero_cta_live: 'Go live', hero_cta_play: 'Play now', hero_cta_dep: 'Add coins',
      casino_title: 'Casino', casino_sub: 'Instant games with transparent odds',
      // casino
      g_crash: 'Crash', g_mines: 'Mines', g_dice: 'Dice', g_slots: 'Fruit Slots', g_wheel: 'Lucky Wheel',
      g_crash_d: 'Cash out before the rocket flies away', g_mines_d: 'Find gems, dodge the mines', g_dice_d: 'Pick your odds and roll',
      g_slots_d: '3 reels · 5 lines', g_wheel_d: 'Free daily spin',
      bet: 'Bet', bet_amount: 'Bet amount', play: 'Play', rtp: 'RTP {n}%', house_edge: 'House edge {n}%',
      crash_wait: 'Next round in {s}s', crash_fly: 'Flying', crash_crashed: 'Flew away at {x}', crash_auto: 'Auto cash out at',
      crash_bet_btn: 'Bet {v} DC', crash_next: 'Bet next round', crash_queued: 'Waiting for next round', crash_cancel: 'Cancel',
      crash_cash: 'Cash out {v}', crash_won: 'Cashed out at {x} · +{v} DC', crash_lost: 'Rocket flew away. Bet lost.',
      crash_history: 'Last rounds', crash_auto_off: 'Off',
      mines_count: 'Mines', mines_start: 'Start game', mines_cash: 'Cash out {v}', mines_next: 'Next tile {x}',
      mines_boom: 'Boom! You hit a mine.', mines_win: 'Cashed out {v} DC', mines_pick: 'Pick a tile',
      dice_under: 'Roll under', dice_over: 'Roll over', dice_chance: 'Win chance', dice_mult: 'Multiplier', dice_roll: 'Roll dice',
      dice_win: 'Rolled {r} · +{v} DC', dice_lose: 'Rolled {r}', dice_target: 'Target',
      slots_spin: 'Spin', slots_win: 'Win {v} DC!', slots_lines: '5 lines · bet split evenly', slots_pay: 'Paytable (× line bet)',
      slots_two_cherry: '2 cherries from the left',
      need_coins: 'Not enough balance. Add demo coins.',
      // info
      info_title: 'About this demo',
      info_p1: 'Demo Betting is a practice sportsbook and casino. Every match is simulated in your browser and every coin is virtual — nothing here involves real money.',
      info_p2: 'Matches are generated with a full result in advance and play out on a fast clock: about 8 minutes for football, a couple of minutes per set for tennis. Odds come from the same model that drew the result, plus a bookmaker margin of 5–14% depending on the market.',
      info_p3: 'Casino games use your browser\'s cryptographic random numbers. Each game shows its return to player or house edge.',
      info_rg_t: 'Play responsibly',
      info_rg: 'Real gambling carries real risk. If betting stops being fun, take a break and talk to someone you trust. This demo is for people aged 18+.',
      info_data_t: 'Your data',
      info_data: 'Accounts, bets and settings are stored in this browser only. Clearing site data removes them.',
      foot_copy: '© {y} Demo Betting · practice project · no real-money gambling',
    },

    so: {
      brand: 'Demo Betting',
      close: 'Xir',
      demo_ribbon: 'DEMO — ciyaaro la dayday iyo lacag tijaabo ah. Lacag dhab ah lama dhigo, lamana bixiyo.',
      play_resp: '18+ · Si mas\'uuliyad leh u ciyaar',
      nav_home: 'Bogga hore', nav_sports: 'Isboorti', nav_live: 'Toos', nav_esports: 'Esports', nav_casino: 'Kasiino',
      nav_crash: 'Crash', nav_results: 'Natiijooyin', nav_promo: 'Dallacaad', nav_mybets: 'Sharadyadayda', nav_account: 'Akoonka',
      nav_menu: 'Liiska', nav_slip: 'Kuuboon', nav_info: 'Ku saabsan demo-ga',
      login: 'Gal', register: 'Is diiwaangeli', logout: 'Ka bax', deposit: 'Ku shub',
      balance: 'Haraaga', coins: 'DC', coins_long: 'lacag tijaabo',
      lang_label: 'Luqadda', theme_label: 'Muuqaalka', theme_auto: 'Nidaamka', theme_dark: 'Madow', theme_light: 'Iftiin',
      odds_fmt: 'Qaabka odds-ka', fmt_dec: 'Tobanle (1.85)', fmt_frac: 'Jajab (17/20)', fmt_us: 'Maraykan (-118)',
      sp_football: 'Kubadda Cagta', sp_basketball: 'Kubadda Koleyga', sp_tennis: 'Teniska', sp_ice_hockey: 'Hoogga Barafka',
      sp_volleyball: 'Kubadda Laliska', sp_table_tennis: 'Teniska Miiska', sp_esports: 'Esports', sp_handball: 'Kubadda Gacanta',
      search_ph: 'Raadi koox ama horyaal', search_title: 'Raadin: “{q}”', search_none: 'Ma jiro ciyaar u dhiganta “{q}”.',
      all: 'Dhammaan', live: 'Toos', upcoming: 'Soo socda', top_leagues: 'Horyaallada ugu sarreeya', sports_list: 'Isboortiga',
      top_live: 'Toos — kuwa ugu muhiimsan', top_upcoming: 'Dhowaan bilaabanaya', see_all: 'Eeg dhammaan',
      live_now: 'Hadda toos', no_live: 'Hadda ciyaar toos ah kuma jirto isboortigan. Ciyaaro cusub ayaa bilaabma dhowr daqiiqo kasta.',
      no_upcoming: 'Hadda ciyaar soo socota halkan kuma jirto.', within: '{n} daqiiqo ee xiga',
      in_min: '{n} daqiiqo kadib', starts_now: 'bilaabanaya', finished: 'Dhammaaday', today: 'Maanta',
      half: 'Qeybta {n}aad', quarter: 'Rubuca {n}aad', period: 'Muddada {n}aad', set_n: 'Set-ka {n}aad', map_n: 'Map-ka {n}aad', break: 'Nasasho',
      all_markets: 'Dhammaan suuqyada', markets: 'Suuqyada', f_all: 'Dhammaan', f_main: 'Muhiim', f_totals: 'Wadarta', f_hcp: 'Handicap', f_score: 'Natiijo',
      total_short: 'Wadar', hcp_short: 'Hcp', over: 'Ka badan', under: 'Ka yar', yes: 'Haa', no: 'Maya', draw: 'Barbaro',
      odd: 'Kisi', even: 'Dhaban', other: 'Natiijo kale', no_goal: 'Gool ma jiro',
      m_1x2: 'Natiijada ciyaarta', m_ml: 'Guuleystaha', m_dc: 'Fursad labalaab', m_total: 'Wadarta', m_hcp: 'Handicap',
      m_btts: 'Labada kooxba gool ma dhalinayaan?', m_tt: 'Wadarta — {team}', m_oe: 'Wadarta kisi/dhaban', m_cs: 'Natiijada saxda ah',
      m_ng: 'Goolka {n}aad — yaa dhalinaya?', m_set: 'Guuleystaha {w}-ka {n}aad', m_sets_total: 'Wadarta {w}-yada', m_sets_hcp: 'Handicap-ka {w}-yada',
      w_set: 'set', w_map: 'map',
      ev_not_found: 'Ciyaartan hadda kuma jirto liiska.', back_home: 'Ku noqo isboortiga',
      ev_finished: 'Ciyaartani way dhammaatay.', final_score: 'Natiijada kama dambaysta ah', starts_at: 'Wuxuu bilaabanayaa {d}',
      goals_title: 'Goolasha', periods_title: 'Qeyb kasta', sets_title: 'Natiijada {w} kasta', susp: 'Suuqyada waa la hakiyay',
      results_title: 'Natiijooyinka', results_none: 'Ciyaaraha dhammaada halkan ayay ka muuqan doonaan.',
      slip: 'Kuuboonka', my_bets: 'Sharadyadayda', single: 'Kali', acca: 'Isku-dar', slip_empty_t: 'Kuuboonkaagu waa madhan',
      slip_empty: 'Taabo odds kasta si aad u doorato. Isku dar 2+ ciyaarood oo kala duwan si aad u samayso isku-dar.',
      stake: 'Lacagta sharadka', total_stake: 'Wadarta lacagta', total_odds: 'Wadarta odds-ka', pot_win: 'Guusha suurtagalka ah',
      place_bet: 'Dhig sharadka', login_to_bet: 'Gal si aad u sharad dhigto', clear_all: 'Tirtir dhammaan', remove: 'Ka saar',
      accept_label: 'Isbeddelka odds-ka', accept_any: 'Aqbal isbeddel kasta', accept_up: 'Aqbal odds-ka kordha', accept_none: 'Marka hore i weydii',
      accept_changes: 'Aqbal isbeddelka', odds_changed: 'Odds-ku wuu isbeddelay', unavailable: 'Lama heli karo',
      conflict: 'Laba doorasho oo isku ciyaar ah lama isku dari karo.', boost_on: 'Kordhinta isku-darka +10% waa la daray',
      boost_hint: 'Ku dar {n} doorasho oo kale oo odds {o}+ ah si aad u hesho +10%',
      err_min: 'Lacagta ugu yar waa {n} DC.', err_max: 'Lacagta ugu badan waa {n} DC.', err_funds: 'Haraagaagu kuma filna. Ku shub lacag tijaabo si aad u sii wadato.',
      err_unavail: 'Doorashooyin qaar lama heli karo. Ka saar si aad u sii wadato.', err_changed: 'Odds-ku wuu isbeddelay. Eeg oo aqbal odds-ka cusub.',
      err_stake: 'Geli lacagta sharadka.', err_acca2: 'Isku-darku wuxuu u baahan yahay ugu yaraan 2 doorasho.',
      bet_ok: 'Sharadka waa la aqbalay · #{id}', bets_ok: '{n} sharad ayaa la aqbalay', max_sel: 'Kuuboonku wuxuu qaadi karaa ilaa 20 doorasho.',
      mb_open: 'Furan', mb_settled: 'Go\'an', mb_all: 'Dhammaan', mb_none: 'Weli sharad halkan kuma jiro.', mb_none_cta: 'U gudub isboortiga',
      st_open: 'Furan', st_won: 'Guuleystay', st_lost: 'Khasaaray', st_void: 'Lacag celin', st_cashed: 'Cash out',
      odds: 'Odds', payout: 'Bixinta', cashout: 'Cash out', cashout_confirm: 'Xaqiiji {v}', cashed_ok: 'Cash out {v} DC',
      settled_won: 'Sharadka #{id} wuu guuleystay: {v} DC', settled_lost: 'Sharadka #{id} wuu khasaaray', settled_void: 'Sharadka #{id} lacagtii waa la celiyay', view_all_bets: 'Dhammaan sharadyadayda',
      reg_title: 'Samee akoon tijaabo ah', reg_oneclick: 'Hal guji', reg_username: 'Magac isticmaale',
      username: 'Magaca isticmaalaha', password: 'Furaha sirta', password2: 'Ku celi furaha sirta',
      age_ok: 'Waxaan ahay 18 jir ama ka weyn, waana fahansanahay in tani tahay demo aan lacag dhab ah lahayn.',
      demo_store_note: 'Akoonnadu waxay ku kaydsan yihiin browser-kan oo kaliya. Ha isticmaalin fure sir ah oo dhab ah.',
      oneclick_note: 'Waxaan kuu samaynaynaa magac iyo fure sir ah, waxaana lagu siinayaa {n} DC oo soo dhaweyn ah.',
      oneclick_btn: 'Is diiwaangeli hal guji', creds_title: 'Akoonkaagu waa diyaar', creds_note: 'Kaydi xogtan si aad mar kale ugu gasho browser-kan.',
      copy: 'Koobi', copied: 'Waa la koobiyay', start_betting: 'Bilow sharadka',
      err_name: 'Magaca: 3–16 xaraf, tiro ama _.', err_pass: 'Furaha sirta waa inuu ahaadaa ugu yaraan 4 xaraf.', err_taken: 'Magacaas horay ayaa loo qaatay browser-kan.',
      err_login: 'Magaca ama furaha sirta waa khalad.', err_match: 'Furayaasha sirta isma laha.', err_age: 'Fadlan xaqiiji inaad tahay 18+.',
      welcome: 'Soo dhawoow, {name}! {n} DC ayaa lagu daray haraagaaga.', logged_in: 'Waxaad gashay sida {name}', logged_out: 'Waad ka baxday',
      need_login: 'Gal ama is diiwaangeli si aad sharad u dhigto.',
      dep_title: 'Ku shub lacag tijaabo', dep_note: 'Lacagta tijaabadu qiimo dhab ah ma laha, lamana bixi karo. Ku shub inta aad rabto.',
      dep_amount: 'Qadarka', dep_btn: 'Ku dar {n} DC', dep_ok: '{n} DC ayaa lagu daray', dep_max: 'Ilaa 10,000 DC mar kasta.',
      withdraw: 'Lacag bixin', wd_note: 'Lacag bixintu way xiran tahay: tani waa demo, lacagtuna dhab ma aha.',
      dep_tab_demo: 'Lacag tijaabo',
      sova_note: 'Lacag-bixin tijaabo ah oo maraysa sandbox-ka SovaMoney. Lacag dhab ah ma dhaqaaqdo. Marka SovaMoney xaqiijiso, qadarka waxaa haraagaaga loogu daraa lacag tijaabo ah (1 USD = 1 DC).',
      sova_amount: 'Qadarka ({c})', sova_name: 'Magaca lacag-bixiyaha', sova_email: 'Iimayl',
      sova_test: 'Akoonka tijaabada sandbox: {email} · koodh {code}',
      sova_btn: 'U gudub SovaMoney', sova_redirect: 'SovaMoney ayaa la furayaa…',
      sova_leave: 'Lacag-bixinta waxaad ku dhammaystiraysaa bogga SovaMoney. Haraagaagu wuu cusboonaanayaa marka SovaMoney xaqiijiso.',
      sova_off: 'Deposit-ka SovaMoney wuxuu shaqeeyaa marka website-ku ku shaqeeyo server-kiisa oo merchant keys-ka la geliyay.',
      sova_checking: 'Waxaa la hubinayaa in SovaMoney diyaar yahay…',
      sova_err_amount: 'Geli qadar u dhexeeya {min} iyo {max} USD.', sova_err_name: 'Geli magac aan ka badnayn 30 xaraf.',
      sova_err_email: 'Geli iimayl sax ah oo aan ka badnayn 30 xaraf.', sova_err_start: 'SovaMoney ma bilaabi karin lacag-bixinta: {m}',
      sova_recent: 'Deposit-yadii SovaMoney ee u dambeeyay', sova_credited: '{n} DC ayaa laga soo daray SovaMoney',
      dpst_title: 'Deposit SovaMoney', dpst_ref: 'Tixraac', dpst_amount: 'Qadarka',
      dpst_pending: 'Waxaan sugaynaa in SovaMoney xaqiijiso lacag-bixinta. Boggan si toos ah ayuu isu cusboonaysiinayaa.',
      dpst_confirmed: 'Lacag-bixinta waa la xaqiijiyay. {n} DC ayaa lagu daray haraagaaga.',
      dpst_cancelled: 'Waad joojisay lacag-bixintan. Haraagaagu isma beddelin.',
      dpst_failed: 'SovaMoney ma dhammaystirin lacag-bixintan. Haraagaagu isma beddelin.',
      dpst_missing: 'Deposit-kan kuma xirna akoonkaaga browser-kan.',
      dpst_offline: 'Server-ka hadda lama gaari karo. Mar kale ayaan isku dayaynaa…', dpst_new: 'Deposit cusub',
      ds_pending: 'Sugaya', ds_confirmed: 'La xaqiijiyay', ds_cancelled: 'La joojiyay', ds_failed: 'Fashilmay',
      tx_sova_deposit: 'Deposit SovaMoney',
      acc_profile: 'Xogta', acc_history: 'Dhaqdhaqaaqa lacagta', acc_settings: 'Dejinta', member_since: 'Xubin tan iyo {d}',
      stat_bets: 'Sharadyada', stat_won: 'Guuleystay', stat_lost: 'Khasaaray', stat_staked: 'Lacagta la dhigay', stat_returned: 'Lacagta soo noqotay', stat_profit: 'Faa\'iido',
      reset_acc: 'Dib u deji akoonka', reset_confirm: 'Ma tirtirtaa haraaga iyo taariikhda?', reset_yes: 'Haa, dib u deji', cancel: 'Jooji', reset_done: 'Akoonka dib ayaa loo dejiyay. {n} DC ayaa lagu daray.',
      tx_date: 'Taariikh', tx_type: 'Nooca', tx_amount: 'Qadarka', tx_balance: 'Haraaga', tx_none: 'Weli dhaqdhaqaaq ma jiro.',
      tx_deposit: 'Ku shub', tx_bonus: 'Gunno', tx_bet: 'Sharad', tx_win: 'Guul', tx_cashout: 'Cash out', tx_refund: 'Lacag celin',
      tx_casino_bet: 'Sharad kasiino', tx_casino_win: 'Guul kasiino',
      settings_note: 'Dejintu waxay ku kaydsan tahay browser-kan.',
      promo_title: 'Dallacaadyo', promo_welcome_t: 'Gunnada soo dhaweynta', promo_welcome: 'Hel {n} DC isla marka aad is diiwaangeliso — hal guji ayaa ku filan.',
      promo_wheel_t: 'Giraangirta nasiibka maalinlaha ah', promo_wheel: 'Wareeji hal mar 24-kii saacadoodba, ku guuleyso ilaa 2,000 DC.',
      promo_boost_t: 'Kordhinta isku-darka', promo_boost: '+10% guusha isku-darka leh 5+ doorasho oo odds 1.30+ ah.',
      promo_cash_t: 'Cash out', promo_cash: 'Xir sharadyada furan goor hore adigoo jooga Sharadyadayda, ka hor dhammaadka ciyaarta.',
      spin: 'Wareeji', spin_again: 'Wareejinta xigta {t}', spin_win: 'Waxaad ku guuleysatay {n} DC!', spin_login: 'Gal si aad u wareejiso',
      hero1_t: '1,000 DC gunno soo dhaweyn', hero1: 'Is diiwaangeli hal guji, ku bilow boorso buuxda oo lacag tijaabo ah.',
      hero2_t: 'Sharad toos ah', hero2: 'Odds-ku wuu isbeddelaa dhowr ilbiriqsi kasta inta ciyaartu socoto.',
      hero3_t: 'Crash', hero3: 'Daawo isku-dhufashada oo kor u kacaysa. Cash out samee ka hor inta aysan duulin.',
      hero_cta_reg: 'Is diiwaangeli', hero_cta_live: 'Toos u gal', hero_cta_play: 'Hadda ciyaar', hero_cta_dep: 'Ku shub',
      casino_title: 'Kasiino', casino_sub: 'Ciyaaro degdeg ah oo odds cad leh',
      g_crash: 'Crash', g_mines: 'Miinooyin', g_dice: 'Laadhuu', g_slots: 'Slots Miro', g_wheel: 'Giraangirta Nasiibka',
      g_crash_d: 'Cash out samee ka hor inta gantaalku duulin', g_mines_d: 'Hel dheemanka, ka fogow miinooyinka', g_dice_d: 'Dooro fursaddaada oo tuur',
      g_slots_d: '3 reel · 5 xariiq', g_wheel_d: 'Wareejin bilaash ah maalin kasta',
      bet: 'Sharad', bet_amount: 'Qadarka sharadka', play: 'Ciyaar', rtp: 'RTP {n}%', house_edge: 'Faa\'iidada guriga {n}%',
      crash_wait: 'Wareegga xiga {s} ilbiriqsi', crash_fly: 'Duulaya', crash_crashed: 'Wuu duulay: {x}', crash_auto: 'Cash out toos ah marka',
      crash_bet_btn: 'Dhig {v} DC', crash_next: 'Dhig wareegga xiga', crash_queued: 'Sugaya wareegga xiga', crash_cancel: 'Jooji',
      crash_cash: 'Cash out {v}', crash_won: 'Cash out {x} · +{v} DC', crash_lost: 'Gantaalku wuu duulay. Sharadka waa lumay.',
      crash_history: 'Wareegyadii u dambeeyay', crash_auto_off: 'Dansan',
      mines_count: 'Miinooyin', mines_start: 'Bilow ciyaarta', mines_cash: 'Cash out {v}', mines_next: 'Godka xiga {x}',
      mines_boom: 'Bam! Miino ayaad taabatay.', mines_win: 'Cash out {v} DC', mines_pick: 'Dooro god',
      dice_under: 'Ka hooseeya', dice_over: 'Ka sarreeya', dice_chance: 'Fursadda guusha', dice_mult: 'Isku-dhufte', dice_roll: 'Tuur laadhuuga',
      dice_win: 'Soo baxay {r} · +{v} DC', dice_lose: 'Soo baxay {r}', dice_target: 'Bartilmaameed',
      slots_spin: 'Wareeji', slots_win: 'Guul {v} DC!', slots_lines: '5 xariiq · sharadka si siman ayaa loo qaybiyaa', slots_pay: 'Miiska bixinta (× sharadka xariiqda)',
      slots_two_cherry: '2 cherry oo bidix ka bilaabma',
      need_coins: 'Haraagaagu kuma filna. Ku shub lacag tijaabo.',
      info_title: 'Ku saabsan demo-gan',
      info_p1: 'Demo Betting waa goob tababar oo sharad isboorti iyo kasiino ah. Ciyaar kasta waxaa lagu dayday browser-kaaga, lacag kastaana waa tijaabo — halkan lacag dhab ah kuma jirto.',
      info_p2: 'Ciyaaraha natiijadooda horay ayaa loo sameeyaa, waxayna ku socdaan saacad degdeg ah: qiyaastii 8 daqiiqo kubadda cagta, dhowr daqiiqo set kasta teniska. Odds-ka waxaa laga helaa isla qaabka natiijada sameeyay, oo lagu daray faa\'iidada bookmaker-ka oo ah 5–14% hadba suuqa.',
      info_p3: 'Ciyaaraha kasiinada waxay isticmaalaan tirooyinka random-ka ah ee browser-kaaga. Ciyaar kasta waxay muujisaa RTP-ga ama faa\'iidada guriga.',
      info_rg_t: 'Si mas\'uuliyad leh u ciyaar',
      info_rg: 'Khamaarka dhabta ahi khatar dhab ah ayuu leeyahay. Haddii sharadku joojiyo inuu madadaalo noqdo, naso oo la hadal qof aad aaminsan tahay. Demo-gan waxaa loogu talagalay dadka 18+ jirka ah.',
      info_data_t: 'Xogtaada',
      info_data: 'Akoonnada, sharadyada iyo dejinta waxay ku kaydsan yihiin browser-kan oo kaliya. Tirtirista xogta goobta ayaa meesha ka saaraysa.',
      foot_copy: '© {y} Demo Betting · mashruuc tababar · khamaar lacag dhab ah ma jiro',
    },
  };
  DB.I18N = D;

  DB.lang = 'en';
  DB.t = (k, v) => {
    let s = (D[DB.lang] && D[DB.lang][k]) != null ? D[DB.lang][k] : D.en[k] != null ? D.en[k] : k;
    if (v) s = s.replace(/\{(\w+)\}/g, (m, x) => (v[x] != null ? v[x] : m));
    return s;
  };
  const t = DB.t;

  const ordEn = (n) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  DB.sportName = (id) => t('sp_' + id);
  DB.setWord = (sport) => (sport === 'esports' ? t('w_map') : t('w_set'));
  DB.fmtLine = (L) => (L > 0 ? '+' + L : String(L));

  /* ---------- odds formats ---------- */
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  DB.fmtOdds = (o) => {
    if (o == null) return '';
    const f = DB.S ? DB.S.settings.oddsFmt : 'dec';
    if (f === 'us') return o >= 2 ? '+' + Math.round((o - 1) * 100) : '-' + Math.round(100 / (o - 1));
    if (f === 'frac') {
      const x = o - 1;
      for (const d of [1, 2, 3, 4, 5, 6, 8, 10, 11, 12, 13, 15, 16, 20, 25, 40, 50]) {
        const n = Math.round(x * d);
        if (n > 0 && Math.abs(n / d - x) < 0.006) {
          const g = gcd(n, d);
          return n / g + '/' + d / g;
        }
      }
      const n = Math.round(x * 100);
      const g = gcd(n, 100) || 1;
      return n / g + '/' + 100 / g;
    }
    return o.toFixed(2);
  };

  /* ---------- markets ---------- */
  const fam = (mkt) => mkt.split(':')[0];
  const arg = (mkt) => {
    const a = mkt.split(':')[1];
    return a == null ? null : parseFloat(a);
  };
  DB.mktFamily = fam;
  DB.mktTitle = (mkt, ev) => {
    const f = fam(mkt);
    const w = DB.setWord(ev.sport);
    switch (f) {
      case 'tt1':
        return t('m_tt', { team: ev.home });
      case 'tt2':
        return t('m_tt', { team: ev.away });
      case 'ng':
        return t('m_ng', { n: arg(mkt) });
      case 'set':
        return t('m_set', { w, n: arg(mkt) });
      case 'sets_total':
        return t('m_sets_total', { w });
      case 'sets_hcp':
        return t('m_sets_hcp', { w });
      default:
        return t('m_' + f);
    }
  };
  DB.outLabel = (mkt, out, ev) => {
    const f = fam(mkt);
    const L = arg(mkt);
    switch (f) {
      case '1x2':
        return out === '1' ? ev.home : out === '2' ? ev.away : t('draw');
      case 'ml':
      case 'set':
        return out === '1' ? ev.home : ev.away;
      case 'dc':
        return out;
      case 'total':
      case 'tt1':
      case 'tt2':
      case 'sets_total':
        return t(out) + ' ' + L;
      case 'hcp':
      case 'sets_hcp':
        return out === '1' ? ev.home + ' (' + DB.fmtLine(L) + ')' : ev.away + ' (' + DB.fmtLine(-L) + ')';
      case 'btts':
        return t(out);
      case 'oe':
        return t(out);
      case 'cs':
        return out === 'other' ? t('other') : out.replace('-', ':');
      case 'ng':
        return out === '1' ? ev.home : out === '2' ? ev.away : t('no_goal');
    }
    return out;
  };
  // short label used on compact odds buttons in event pages
  DB.outShort = (mkt, out, ev) => {
    const f = fam(mkt);
    if (f === '1x2') return out === 'X' ? 'X' : out === '1' ? 'W1' : 'W2';
    return DB.outLabel(mkt, out, ev);
  };

  /* ---------- clock & score ---------- */
  DB.score = (ev, st) => {
    if (st.status === 'pre') return null;
    const kind = DB.E.sport(ev.sport).kind;
    return kind === 'goals' ? [st.h, st.a] : [st.sh, st.sa];
  };
  DB.clockHTML = (ev, st, now) => {
    now = now || DB.E.now;
    if (st.status === 'pre') {
      const mins = Math.ceil((ev.start - now) / 60000);
      const soon = mins <= 15 ? '<span class="soon">' + U.esc(mins <= 0 ? t('starts_now') : t('in_min', { n: mins })) + '</span>' : '';
      return '<span class="tm">' + U.hm(ev.start) + '</span>' + soon;
    }
    if (st.status === 'done') return '<span class="fin">' + U.esc(t('finished')) + '</span>';
    const cfg = DB.E.sport(ev.sport);
    let per = '';
    let clk = '';
    if (cfg.kind === 'goals') {
      const plen = cfg.dur / cfg.periods;
      const p = Math.min(cfg.periods, Math.floor(st.m / plen) + 1);
      if (ev.sport === 'football' || ev.sport === 'handball') {
        per = t('half', { n: p, o: ordEn(p) });
        clk = Math.min(cfg.dur, Math.floor(st.m) + 1) + "'";
      } else {
        per = ev.sport === 'basketball' ? t('quarter', { n: p, o: ordEn(p) }) : t('period', { n: p, o: ordEn(p) });
        clk = U.mmss((st.m - (p - 1) * plen) * 60);
      }
    } else {
      per = ev.sport === 'esports' ? t('map_n', { n: st.cur }) : t('set_n', { n: st.cur });
      clk = st.ph + ':' + st.pa;
    }
    return '<span class="live-dot" aria-hidden="true"></span><span class="per">' + U.esc(per) + '</span><b class="clk">' + clk + '</b>';
  };
  DB.txLabel = (type) => t('tx_' + type);
})();
