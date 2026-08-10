/**
 * Demo sample-roster generator.
 *
 * Produces a realistic, deterministic roster CSV that feeds straight into the
 * bulk import wizard — so a demo can show real-school scale (hundreds of
 * students, dozens of teachers) without anyone typing a spreadsheet.
 *
 * Determinism matters: the same seed always yields the same roster, so demos
 * are reproducible. Rows are generated from curated Nigerian name pools; some
 * students are given parents, and siblings deliberately share a parent phone
 * so the import's parent-dedupe logic has real work to do.
 */
import { toCSV } from "./csv.js";
import { TEMPLATES } from "./importer.js";

// The real Nigerian secondary structure — JSS1–JSS3 are PLAIN classes (no
// Science / Arts / Commercial streams; streaming starts at SSS), and only
// SS1–SS3 split into the three streams — 12 class arms, matching the demo
// school's arms.
export const DEFAULT_SAMPLE_ARMS = [
  "JSS1", "JSS2", "JSS3",
  "SS1 Science", "SS1 Arts", "SS1 Commercial",
  "SS2 Science", "SS2 Arts", "SS2 Commercial",
  "SS3 Science", "SS3 Arts", "SS3 Commercial",
];

const FIRST_NAMES = [
  "Kunle", "Chidinma", "Emeka", "Fatima", "Ibrahim", "Sarah", "Tobi", "Grace",
  "David", "Hannah", "Adaeze", "Bola", "Chuka", "Damilare", "Efe", "Gbenga",
  "Halima", "Ifeanyi", "Joy", "Kelechi", "Lola", "Musa", "Ngozi", "Oluchi",
  "Peter", "Queen", "Rotimi", "Simi", "Uche", "Victor", "Wale", "Xenia",
  "Yemi", "Zainab", "Adaora", "Ben", "Chioma", "Deji", "Fola", "Gbemisola",
  "Hauwa", "Ikenna", "Jumoke", "Kemi", "Lanre", "Maryam", "Nneka", "Aisha",
  "Bello", "Chinelo", "Dauda", "Ezinne", "Olumide", "Zara", "Kabir", "Abiola",
  "Bankole", "Chiamaka", "Dolapo", "Ese", "Funmilayo", "Goke", "Habeeb",
  "Ijeoma", "Jide", "Khadijat", "Lateef", "Mobolaji", "Ndidi", "Obinna",
  "Peju", "Rasaki", "Sade", "Tunde", "Ujunwa", "Yakubu", "Zubairu", "Amara",
  "Bisola", "Chidera", "Dipo", "Ekun", "Fikayo", "Ganiyu", "Hassan", "Izu",
  "Jibril", "Kofoworola", "Lekan", "Modupe", "Nnamdi", "Olawale", "Precious",
  "Rukayat", "Segun", "Temiloluwa", "Uzoma", "Yewande", "Abdul", "Bukola",
  "Chisom", "Dara", "Ebuka", "Folashade", "Gideon", "Hikmat", "Ireti",
  "Jola", "Kamsi", "Lara", "Moyo", "Ngozika", "Ogochukwu", "Pamela", "Rita",
  "Seyi", "Tolulope", "Ufuoma", "Yinka", "Zikora", "Adekunle", "Bamidele",
];

const SURNAMES = [
  "Adebayo", "Obi", "Nwosu", "Bello", "Musa", "Johnson", "Alade", "Uche",
  "Osei", "Kalu", "Okonkwo", "Adeyemi", "Eze", "Ogunleye", "Otubu", "Alabi",
  "Yusuf", "Umeh", "Nwachukwu", "Okafor", "Adebisi", "Danladi", "Nwosu",
  "Adeyemo", "Osei", "Akin", "Fashola", "Adeyinka", "Obi", "Okafor",
  "Adeleke", "Ebi", "Ojo", "Abdullahi", "Mba", "Oyelaran", "Ogunbiyi", "Ude",
  "Aluko", "Sani", "Adewale", "Osho", "Ibrahim", "Mohammed", "Abubakar",
  "Ibe", "Sule", "Adekunle", "Bello", "Abiola", "Akande", "Amadi", "Anya",
  "Awolowo", "Bakare", "Balogun", "Chukwu", "Dada", "Ekwueme", "Emenike",
  "Fagbemi", "Falana", "Gbadamosi", "Igbokwe", "Ilo", "Isiaka", "Jegede",
  "Lawal", "Madu", "Nnamdi", "Odugbo", "Ogundipe", "Okpara", "Olowo",
  "Onyema", "Oshodi", "Oyekanmi", "Salami", "Sowore", "Ukaegbu", "Uzochukwu",
  "Yakubu", "Zubairu", "Adebiyi", "Agboola", "Ajayi", "Akinwunmi", "Anjorin",
  "Babatunde", "Chime", "Diya", "Edet", "Ekanem", "Fadipe", "Garba", "Ibeh",
  "Imoh", "Kazeem", "Ladipo", "Makanjuola", "Nwachukwu", "Obiakor", "Okafor",
  "Okereke", "Olagunju", "Oyelaran", "Salaudeen", "Tella", "Ubani", "Yahaya",
];

const PARENT_TITLES = ["Mr.", "Mrs.", "Dr.", "Alhaji", "Hajia", "Chief", "Pastor", "Engr.", "Prof."];

/** Deterministic PRNG (mulberry32) — same seed, same roster every time. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rand, pool) => pool[Math.floor(rand() * pool.length)];

const pickName = (rand) => `${pick(rand, FIRST_NAMES)} ${pick(rand, SURNAMES)}`;
const pickParentName = (rand) =>
  `${pick(rand, PARENT_TITLES)} ${pick(rand, FIRST_NAMES)} ${pick(rand, SURNAMES)}`;

/** Deterministic 11-digit Nigerian mobile number (0 + 10 digits), unique per index. */
const phone = (base, index) => `0${String(base + index)}`;

// JSS arms are plain classes; SS arms split into the three streams. Stream
// groupings of the full arm list — the subject-specialist profiles below
// assign teachers to every arm of their group (mirrors the seed).
const JSS_ARMS = DEFAULT_SAMPLE_ARMS.filter((a) => !a.includes(" "));
const SCIENCE_ARMS = DEFAULT_SAMPLE_ARMS.filter((a) => a.endsWith(" Science"));
const ARTS_ARMS = DEFAULT_SAMPLE_ARMS.filter((a) => a.endsWith(" Arts"));
const COMMERCIAL_ARMS = DEFAULT_SAMPLE_ARMS.filter((a) => a.endsWith(" Commercial"));

// Subject-specialist teaching profiles (the Nigerian reality): a Mathematics
// teacher covers ALL arms, a Physics teacher only the Science arms, a Basic
// Science / Social Studies teacher the JSS classes (plus the related SSS
// stream), and so on. The roster round-robins through these so the sample
// demonstrates the subjects × arms scope the import now captures.
const TEACHER_PROFILES = [
  { subjects: ["Mathematics"], arms: DEFAULT_SAMPLE_ARMS },
  { subjects: ["English Language"], arms: DEFAULT_SAMPLE_ARMS },
  { subjects: ["Civic Education"], arms: DEFAULT_SAMPLE_ARMS },
  { subjects: ["Physics"], arms: SCIENCE_ARMS },
  { subjects: ["Chemistry"], arms: SCIENCE_ARMS },
  { subjects: ["Biology"], arms: SCIENCE_ARMS },
  { subjects: ["Literature in English"], arms: ARTS_ARMS },
  { subjects: ["Government"], arms: ARTS_ARMS },
  { subjects: ["French"], arms: ARTS_ARMS },
  { subjects: ["Accounting"], arms: COMMERCIAL_ARMS },
  { subjects: ["Commerce"], arms: COMMERCIAL_ARMS },
  { subjects: ["Economics"], arms: [...ARTS_ARMS, ...COMMERCIAL_ARMS] },
  // JSS junior curriculum — plain classes, taught by the JSS specialists
  // (some of whom also take the related SSS subject, like the seed).
  { subjects: ["Basic Science", "Biology"], arms: [...JSS_ARMS, ...SCIENCE_ARMS] },
  { subjects: ["Social Studies", "Government"], arms: [...JSS_ARMS, ...ARTS_ARMS] },
  { subjects: ["Business Studies"], arms: [...JSS_ARMS, ...COMMERCIAL_ARMS] },
  { subjects: ["Agricultural Science"], arms: [...JSS_ARMS, ...SCIENCE_ARMS] },
  { subjects: ["Basic Technology"], arms: JSS_ARMS },
  { subjects: ["Computer Studies"], arms: JSS_ARMS },
];

/**
 * Build a sample roster CSV for the import wizard.
 * @param {Object} opts
 * @param {"STUDENT"|"TEACHER"} opts.role
 * @param {string[]} [opts.arms]     class arms to distribute students across
 * @param {number} [opts.studentsPerArm]   default 150 (12 arms -> 1800 students)
 * @param {number} [opts.teacherCount]      default 50
 * @param {number} [opts.seed]              default 2025 (reproducible)
 * @returns {string} CSV text with a template header row
 */
export function generateRosterCsv({
  role,
  arms = DEFAULT_SAMPLE_ARMS,
  studentsPerArm = 150,
  teacherCount = 50,
  seed = 2025,
} = {}) {
  const rand = mulberry32(seed);

  if (role === "TEACHER") {
    const rows = [TEMPLATES.TEACHER.headers];
    for (let i = 0; i < teacherCount; i++) {
      // Round-robin the profiles (like the seed: one Math + one English
      // teacher for every arm, stream specialists for their own streams).
      const profile = TEACHER_PROFILES[i % TEACHER_PROFILES.length];
      rows.push([
        pickName(rand),
        "", // email -> auto-generated on import
        profile.arms[0], // display/default arm
        profile.subjects.join("; "),
        profile.arms.join("; "),
        phone(8200000000, i),
        "", // password -> default
      ]);
    }
    return toCSV(rows);
  }

  const rows = [TEMPLATES.STUDENT.headers];
  let idx = 0;
  for (const arm of arms) {
    for (let s = 0; s < studentsPerArm; s++) {
      let parentName = "";
      let parentPhone = "";
      // ~half the students carry a parent; parents are shared so siblings
      // (e.g. indices 0 & 2) resolve to ONE account on import.
      if (idx % 2 === 0) {
        const parentIdx = Math.floor(idx / 4);
        parentName = pickParentName(rand);
        parentPhone = phone(8100000000, parentIdx);
      }
      rows.push([
        pickName(rand),
        "",
        arm,
        phone(8000000000, idx),
        "",
        parentName,
        parentPhone,
      ]);
      idx++;
    }
  }
  return toCSV(rows);
}

/** Total sample size helpers for the UI copy. */
export function sampleSize(arms = DEFAULT_SAMPLE_ARMS, studentsPerArm = 150) {
  return { students: arms.length * studentsPerArm, teachers: 50 };
}
