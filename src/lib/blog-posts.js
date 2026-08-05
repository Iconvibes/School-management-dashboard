// Blog content for the Edutrack marketing site.
// Each post has metadata plus a list of content blocks rendered by
// /blog/[slug]. Plain data — no components — so it can be imported by
// both server and client components.

export const categories = [
  { id: "all", label: "All posts" },
  { id: "report-cards", label: "Report Cards" },
  { id: "fees", label: "Fees & Finance" },
  { id: "exams", label: "Exams & Grading" },
  { id: "attendance", label: "Attendance" },
  { id: "parents", label: "Parent Engagement" },
  { id: "getting-started", label: "Getting Started" },
];

export const posts = [
  {
    slug: "how-to-run-term-exams-digitally",
    title: "How to run term exams digitally",
    category: "exams",
    categoryLabel: "Exams & Grading",
    date: "July 28, 2026",
    readTime: "6 min read",
    excerpt:
      "The chaos of exam week — printed answer scripts, piles of marking, two weeks of result computation — is optional. Here's the exact digital workflow top schools use to go from last exam to printed report cards in an afternoon.",
    author: { name: "Dr. Ifeoma Nwosu", role: "Proprietress, Sunrise College", initials: "IN" },
    blocks: [
      { type: "lead", text: "For most schools, exam week is a two-week sentence of late nights. Scripts to collect, mark, tally, rank, and transcribe — before a single report card can be printed. The schools that broke out of that cycle did not grade faster. They changed the workflow." },
      { type: "h2", text: "Start from the result, not the script" },
      { type: "p", text: "Before you decide how to run exams digitally, decide what you actually need at the end: a report card per student with CA, exam, total, grade, position, remarks and attendance. Work backwards from there. When the end state is defined, every step becomes a data-entry task instead of a data-recreation task." },
      { type: "h2", text: "Capture scores once, in the right boxes" },
      { type: "p", text: "The single biggest time-waster in manual marking is re-copying. A teacher marks scripts, writes totals in a notebook, then a clerk copies them into a spreadsheet, then someone retypes them into the report card format. Every copy is a chance for a 7 to become a 1. Digital grading matrices remove the copies: the teacher types CA (out of 40) and Exam (out of 60) once, and the total, percentage and letter grade compute themselves." },
      { type: "h2", text: "Let the machine rank" },
      { type: "p", text: "Class position — that all-important 1st, 2nd, 3rd — should never be counted by hand again. Position is arithmetic over the same scores you already entered. When a school computes it automatically, report cards that took two weeks now print the same day the last teacher saves." },
      { type: "ul", text: "A realistic digital exam-day workflow", items: [
        "Before the exam: publish the term calendar and share it with all class teachers in the portal.",
        "On exam day: students sit as usual — the paper exam does not change.",
        "After marking: each teacher enters CA and Exam scores into the grading matrix for their class arm.",
        "Verify: a head teacher reviews the class summaries — totals, grades, positions — before release.",
        "Publish: generate every report card for the arm in one click, then print or export the PDFs.",
      ] },
      { type: "h2", text: "Keep paper as the backup, not the system" },
      { type: "p", text: "Nothing about digital grading forces a school to abandon paper scripts — they remain the audit trail and the backup. The difference is that paper becomes evidence of scores already captured in the system, rather than the only copy that exists. If a parent questions a grade, you pull up the student's record instantly instead of searching a drawer." },
      { type: "h2", text: "The result parents actually see" },
      { type: "p", text: "Digital exams change the parent conversation too. When report cards exist in a portal, parents stop calling the office asking for results — they check their child's card from their phone. That single change quietly removes dozens of phone calls every term." },
      { type: "tip", text: "Start small: pilot digital grading with one class arm for a term, compare the time and error rate against manual, then roll out to the whole school." },
    ],
  },
  {
    slug: "fee-collection-tips-for-nigerian-schools",
    title: "Fee collection tips for Nigerian schools",
    category: "fees",
    categoryLabel: "Fees & Finance",
    date: "July 21, 2026",
    readTime: "7 min read",
    excerpt:
      "Cash flow decides whether a school pays staff on time, buys books, or delays maintenance. These are the collection habits that keep a bursar's ledger healthy — without turning the office into a collection agency.",
    author: { name: "Mr. Tunde Bakare", role: "Bursar, Lakeside Academy", initials: "TB" },
    blocks: [
      { type: "lead", text: "Fee collection is not about being aggressive — it is about being organised. The schools with the healthiest cash flow are rarely the ones that shout the loudest. They are the ones whose records are so clear that nothing can be disputed, forgotten, or 'lost in the system'." },
      { type: "h2", text: "Publish what each class owes" },
      { type: "p", text: "Ambiguity is the enemy of collection. When fee structures exist per class arm and per term — and parents can see exactly what SS1 Science owes this term — most of the friction disappears. A parent who knows the amount and the deadline pays earlier than one who has to ask." },
      { type: "h2", text: "Track partial payments relentlessly" },
      { type: "p", text: "Nigerian families often pay school fees in two or three instalments. If your system only has 'paid' and 'unpaid', the ledger is a lie — a student who has paid 60% shows as a defaulter, and a student who has paid 100% shows as paid. Track every payment against a running balance: billed, paid, and outstanding per student. The moment a balance is visible, everyone knows where they stand." },
      { type: "h2", text: "Issue a receipt for everything" },
      { type: "p", text: "A numbered receipt is not bureaucracy — it is trust. When every payment produces an instant receipt (cash, transfer, POS, USSD, card), parents can reconcile their own records, and your ledger has an audit trail. Receipts also cut the 'I paid and nobody recorded it' disputes that burn hours of admin time." },
      { type: "h2", text: "Chase defaulters with data, not memory" },
      { type: "p", text: "The defaulters list is where collection actually happens. Sort students by outstanding balance and contact the families that matter, in order. Because the list is automatic, nobody slips through because someone forgot their name. Because it is polite — a short WhatsApp with the exact balance — nobody feels hounded." },
      { type: "h2", text: "Let parents pay from their phones" },
      { type: "p", text: "The friction of visiting the school office to pay is real. Parents who can open a link, pay the outstanding balance, and get an instant receipt will pay on time more often — and will feel better about it. Online payments also mean the money lands in the ledger without anyone having to record it by hand." },
      { type: "tip", text: "Run a 'settle your balance' drive two weeks before results are released. Schools find that fee collection rises sharply when parents know report cards are tied to a clear payment status." },
    ],
  },
  {
    slug: "why-automated-report-cards-transform-a-school",
    title: "Why automated report cards transform a school",
    category: "report-cards",
    categoryLabel: "Report Cards",
    date: "July 14, 2026",
    readTime: "5 min read",
    excerpt:
      "The report card is the single most important document a school produces — and for most schools it is still produced by hand, twice a year, at the cost of a fortnight of staff time. Automation changes more than the print run.",
    author: { name: "Mrs. Adaeze Okafor", role: "Principal, Greenfield International School", initials: "AO" },
    blocks: [
      { type: "lead", text: "Ask any principal when they sleep least during the term and the answer is the same: report card week. The results themselves were finished days earlier — it is the computation, the transcription, the signing, and the printing that eat the time." },
      { type: "h2", text: "Accuracy is the quiet win" },
      { type: "p", text: "A manual report card error — a wrong total, a misplaced grade, a ranking mistake — does more damage than a late report card. It is a credibility event with the family and an embarrassment for the school. Automated report cards compute totals, grades and positions from scores entered once, so the number on the card is always the number in the system." },
      { type: "h2", text: "Consistency across the school" },
      { type: "p", text: "When every class teacher formats cards their own way, the school looks disorganised even when the teaching is excellent. Automated generation gives every student a branded, consistent card — the school logo, the grading scale, the remark conventions, the signature blocks — identical from SS1 to JSS3." },
      { type: "h2", text: "The head teacher stops being the bottleneck" },
      { type: "p", text: "In manual systems, every card flows through the head teacher for review and signature — a hundred signatures, a hundred chances to be a blocker. With automation, the head reviews the class summary once, and the signature block prints on every card." },
      { type: "h2", text: "Parents get the card, not the runaround" },
      { type: "p", text: "An automated report card is a PDF that can be sent by WhatsApp, printed in bulk, or viewed in the parent portal. The family gets the result in minutes instead of fetching it from the school office — and the school gets its time back." },
      { type: "ul", text: "What a modern report card includes", items: [
        "Subject-by-subject CA, exam, total and letter grade",
        "Class position computed within each arm",
        "Per-subject remarks generated from grades",
        "Attendance summary for the term",
        "Class teacher and head teacher signature blocks",
        "School logo and branding, print-ready A4",
      ] },
      { type: "tip", text: "Print one sample card for each class arm before the real run and pin it to the staff room board. Teachers spot conventions they want changed far faster on paper than in a spreadsheet." },
    ],
  },
  {
    slug: "daily-attendance-small-effort-big-insight",
    title: "Daily attendance: small effort, big insight",
    category: "attendance",
    categoryLabel: "Attendance",
    date: "July 7, 2026",
    readTime: "5 min read",
    excerpt:
      "Attendance is the cheapest data a school collects and the most predictive. One tap per student per day, repeated for a term, tells you which classes are slipping, which students are at risk — and what belongs on the report card.",
    author: { name: "Dr. Ifeoma Nwosu", role: "Proprietress, Sunrise College", initials: "IN" },
    blocks: [
      { type: "lead", text: "Every school registers attendance — on paper, in a register that gets copied into a bigger register, and consulted roughly never. The effort is real, but the insight is thrown away. Digital attendance turns that same effort into the school's clearest early-warning system." },
      { type: "h2", text: "One tap per student, per day" },
      { type: "p", text: "The register is taken in the first period by the class teacher — the same person, the same moment, just in a portal instead of a notebook. Present or absent, one tap each, and the register is saved. No stacking of forms, no end-of-term transcribing marathon." },
      { type: "h2", text: "Patterns, not just totals" },
      { type: "p", text: "A single absence is noise. Five Mondays in a row is a pattern — and it is exactly the kind of pattern that predicts a student drifting away from school. When attendance is digital, those patterns surface themselves: which class arm has the lowest attendance this month, which student has missed ten days this term." },
      { type: "h2", text: "Attendance belongs on the report card" },
      { type: "p", text: "Parents read the attendance line on a report card more carefully than almost any other line. Days present, days absent, out of how many — it is concrete, personal, and impossible to argue with. It is also a gentle, professional way for the school to say 'we are watching, and we care'." },
      { type: "h2", text: "Teachers stay in their lanes" },
      { type: "p", text: "A good attendance system is also a discipline system: the teacher marks their own class arm and nobody else's. When access is locked by role, there is no accidental cross-class editing and no dispute about who changed what." },
      { type: "tip", text: "Set a 'high absence' flag at a threshold your school chooses — say, 15% of school days — and review the flagged list monthly. It turns attendance from paperwork into pastoral care." },
    ],
  },
  {
    slug: "the-parent-school-relationship-digitized",
    title: "The parent-school relationship, digitized",
    category: "parents",
    categoryLabel: "Parent Engagement",
    date: "June 30, 2026",
    readTime: "6 min read",
    excerpt:
      "The families that feel connected to a school are the families that stay, renew, and recommend it. A parent portal is not a luxury — it is the modern version of the open-door policy.",
    author: { name: "Mrs. Adaeze Okafor", role: "Principal, Greenfield International School", initials: "AO" },
    blocks: [
      { type: "lead", text: "The head teacher's office used to be where parents came with questions — about results, about fees, about attendance. Most of those questions have identical answers. A parent portal answers them at 9pm from the sofa, and the office keeps its doors open for the conversations that actually need a human." },
      { type: "h2", text: "Give parents the numbers, not the runaround" },
      { type: "p", text: "The three things parents ask about, every term, are the same three things: how is my child doing, was my child in school, and how much do I owe. A parent portal with report cards, attendance history, and a live fee balance answers all three before the question is even asked." },
      { type: "h2", text: "The Pay Now moment" },
      { type: "p", text: "When a parent sees a balance and can clear it in one tap — with an instant receipt — the school stops being a place where money is awkward and becomes a place where money is easy. Schools that turn on online fee payment report earlier collections and fewer 'I'll come and pay this week' promises that never happen." },
      { type: "h2", text: "Boundaries that build trust" },
      { type: "p", text: "A parent portal that shows a parent exactly their own children — and nothing else — is a trust statement. No other family's results, no other family's balances. Privacy is not a feature you bolt on; it is the reason the school can responsibly share data at all." },
      { type: "h2", text: "No app install required" },
      { type: "p", text: "The quiet genius of a web-based parent portal is that it works on every phone a parent owns. No app store, no download, no 'my storage is full'. The parent opens the link, logs in, and everything is there." },
      { type: "tip", text: "At enrolment, collect the parent's email and phone and create the parent account on the spot. The portal is only powerful if the family actually uses it — set it up while the enthusiasm is high." },
    ],
  },
  {
    slug: "moving-your-school-to-cloud-software",
    title: "Moving your school to cloud software: a practical guide",
    category: "getting-started",
    categoryLabel: "Getting Started",
    date: "June 23, 2026",
    readTime: "8 min read",
    excerpt:
      "The jump from paper and Excel to a cloud school platform is easier than the admin team fears — and harder than the software vendors promise. Here is the migration sequence that actually works for schools.",
    author: { name: "Edutrack Team", role: "Onboarding, Edutrack", initials: "ET" },
    blocks: [
      { type: "lead", text: "Every school we onboard starts from a different place: some are fully on paper, some are in three spreadsheets, a few are in an old desktop application. The migration sequence that works is always the same, whatever the starting point." },
      { type: "h2", text: "Step 1 — Register the school, set the structure" },
      { type: "p", text: "Create the school's tenant, choose the session and term, and set up class arms (SS1 Science, SS1 Arts, JSS2…). This is the skeleton everything else hangs on, and it takes minutes. Do not skip the class-arm step — every report card and attendance register is organised by it." },
      { type: "h2", text: "Step 2 — Bring in the people" },
      { type: "p", text: "Add teachers and students next. For a full school this is the biggest data-entry task, which is why bulk import (a CSV of names, classes and details) matters. Then link parents to their children so the family portal is ready on day one." },
      { type: "h2", text: "Step 3 — Set the money" },
      { type: "p", text: "Define the fee structure per class arm for the current term. From this moment, the ledger starts tracking billed, paid and outstanding automatically. Do this before the first payment of the term lands in the system." },
      { type: "h2", text: "Step 4 — Run one cycle, then switch" },
      { type: "p", text: "The schools with the smoothest migrations do one full cycle — a grading matrix, an attendance register, a report card run — in the new system while still keeping the old records as backup. One successful cycle is all the confidence the staff need." },
      { type: "h2", text: "What staff actually need to learn" },
      { type: "p", text: "Teachers need exactly three skills: log in, enter scores, save. The admin team needs the same three plus the fee and report generation screens. If training takes longer than an afternoon, the software is too complicated — good school software is deliberately boring to use." },
      { type: "ul", text: "Common migration mistakes to avoid", items: [
        "Migrating mid-term without a defined cut-off for the old records",
        "Letting two people 'own' the same data — one source of truth per record",
        "Skipping the parent linking step and discovering it at results time",
        "Trying to recreate ten years of history in the first week — start with the current term",
      ] },
      { type: "tip", text: "Pick a quiet week — not exam week, not resumption week — for the switchover, and designate one staff member as the internal champion who answers colleagues' questions from day one." },
    ],
  },
];

// Lookup helper for the article page.
export function getPost(slug) {
  return posts.find((p) => p.slug === slug);
}

export function getRelated(post, count = 3) {
  return posts
    .filter((p) => p.slug !== post.slug)
    .sort((a, b) => {
      const aSame = a.category === post.category ? 1 : 0;
      const bSame = b.category === post.category ? 1 : 0;
      return bSame - aSame;
    })
    .slice(0, count);
}
