// Badge catalogue. Each badge reads one counter from progress.counters; tiers are bronze, silver, gold.
export const TIER_NAMES = ["Bronze", "Silver", "Gold"];

export const BADGES = [
  // Play
  { id: "first-win", group: "Play", name: "First win", icon: "ph-trophy", counter: "gamesWon", goals: [1, 25, 100], hint: "Win games against GNU" },
  { id: "gammon-hunter", group: "Play", name: "Gammon hunter", icon: "ph-crown-simple", counter: "gammonsWon", goals: [1, 10, 50], hint: "Win gammons" },
  { id: "backgammon", group: "Play", name: "Backgammon!", icon: "ph-crown", counter: "backgammonsWon", goals: [1], hint: "Win a backgammon" },
  { id: "giant-slayer", group: "Play", name: "Giant slayer", icon: "ph-sword", counter: "strongWins", goals: [1, 5, 25], hint: "Beat GNU at Expert or World class" },
  { id: "comeback", group: "Play", name: "Comeback", icon: "ph-arrow-u-up-left", counter: "comebacks", goals: [1, 5], hint: "Win after trailing by 60 pips or more" },
  { id: "match-winner", group: "Play", name: "Match winner", icon: "ph-medal", counter: "matchesWon", goals: [1, 5, 20], hint: "Win matches" },
  { id: "long-haul", group: "Play", name: "Long haul", icon: "ph-mountains", counter: "longMatchesWon", goals: [1, 5], hint: "Win a match to 7 points or more" },
  { id: "flawless", group: "Play", name: "Flawless", icon: "ph-diamond", counter: "flawless", goals: [1, 5, 20], hint: "Win a game with no mistakes (10+ decisions)" },
  // Skill
  { id: "sharp-eye", group: "Skill", name: "Sharp eye", icon: "ph-eye", counter: "bestRunMax", goals: [5, 10, 25], hint: "Find the best move several times in a row" },
  { id: "precision", group: "Skill", name: "Precision", icon: "ph-crosshair", counter: "bestDecisions", goals: [50, 250, 1000], hint: "Make the engine's top choice" },
  { id: "cube-sense", group: "Skill", name: "Cube sense", icon: "ph-cube", counter: "cubeCorrect", goals: [10, 50, 200], hint: "Get cube decisions right" },
  { id: "bearoff-pro", group: "Skill", name: "Bear-off pro", icon: "ph-sign-out", counter: "bearoffGood", goals: [25, 100, 250], hint: "Play bear-off positions accurately" },
  { id: "student", group: "Skill", name: "Student of the game", icon: "ph-books", counter: "decisions", goals: [100, 1000, 5000], hint: "Make decisions anywhere in the app" },
  // Habit
  { id: "streak", group: "Habit", name: "On fire", icon: "ph-fire", counter: "dailyStreak", goals: [3, 7, 30], hint: "Keep a daily challenge streak" },
  { id: "centurion", group: "Habit", name: "Centurion", icon: "ph-calendar-check", counter: "dailyStreak", goals: [100], hint: "Reach a 100-day streak" },
  { id: "perfect-day", group: "Habit", name: "Perfect day", icon: "ph-star-four", counter: "perfectDailies", goals: [1, 5, 20], hint: "Finish a daily challenge without a single error" },
  { id: "early-bird", group: "Habit", name: "Early bird", icon: "ph-sun-horizon", counter: "earlyBird", goals: [1, 10], hint: "Finish the daily challenge before 8 am" },
  { id: "night-owl", group: "Habit", name: "Night owl", icon: "ph-moon", counter: "nightOwl", goals: [1], hint: "Train after midnight" },
  // Learning
  { id: "first-lesson", group: "Learning", name: "Lessons", icon: "ph-graduation-cap", counter: "lessonsPassed", goals: [1, 10, 50], hint: "Pass lessons in the Learn path" },
  { id: "three-stars", group: "Learning", name: "Three stars", icon: "ph-star", counter: "threeStarLessons", goals: [1, 10, 30], hint: "Earn 3 stars in a lesson" },
  { id: "chapters", group: "Learning", name: "Academy", icon: "ph-certificate", counter: "chaptersDone", goals: [1, 5, 10], hint: "Complete whole chapters (all 10 for gold)" },
  { id: "mastery", group: "Learning", name: "Mastery", icon: "ph-brain", counter: "mastered", goals: [1, 10, 50], hint: "Master positions in your review deck" },
];

export const badgeById = Object.fromEntries(BADGES.map((b) => [b.id, b]));
