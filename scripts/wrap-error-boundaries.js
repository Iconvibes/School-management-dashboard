const fs = require("fs");

// === TEACHER DASHBOARD ===
let t = fs.readFileSync("src/app/teacher/dashboard/page.js", "utf8");

// Add ErrorBoundary import
if (!t.includes('import ErrorBoundary')) {
  t = t.replace(
    'import ResourcesTab from "@/components/teacher/ResourcesTab";',
    'import ResourcesTab from "@/components/teacher/ResourcesTab";\nimport ErrorBoundary from "@/components/ErrorBoundary";'
  );
}

// Helper: wrap a view block in ErrorBoundary
function wrapView(content, comment, label, openTag, closePattern, closingBraces) {
  const regex = new RegExp(
    `(\\{\\/\\* ${comment} \\*\\/\\}\\s*\\n\\{view === \\"[^"]+\\" && \\(\\s*\\n\\s*)${openTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
    ""
  );
  const openMatch = content.match(regex);
  if (!openMatch) {
    console.log(`  SKIP open for ${label}`);
    return content;
  }

  // Find the closing: the pattern after the last prop
  const closeRegex = new RegExp(
    `(\\{\\/\\* ${comment} \\*\\/\\}\\s*\\n\\{view === \\"[^"]+\\" && \\(\\s*\\n\\s*${openTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?)(\\/>\\s*\\))\\}`,
    ""
  );
  const closeMatch = content.match(closeRegex);
  if (!closeMatch) {
    console.log(`  SKIP close for ${label}`);
    return content;
  }

  const fullMatch = closeMatch[0];
  const insertAt = fullMatch.lastIndexOf("/>") + 2;
  const before = fullMatch.slice(0, insertAt);
  const after = fullMatch.slice(insertAt);

  const replacement = before + "\n</ErrorBoundary>" + after;
  const newContent = content.replace(fullMatch, replacement);
  console.log(`  Wrapped ${label}`);
  return newContent;
}

// ATTENDANCE
t = t.replace(
  /(\{\/\* ATTENDANCE VIEW \*\/\}\s*\n\{view === "attendance" && \(\s*\n\s*<AttendanceView[\s\S]*?setAttStatus=\{setAttStatus\}\s*\/>)/,
  '$1\n</ErrorBoundary>'
);
t = t.replace(
  /(\{\/\* ATTENDANCE VIEW \*\/\}\s*\n\{view === "attendance" && \(\s*\n)/,
  '$1<ErrorBoundary label="Attendance">\n'
);

// TIMETABLE
t = t.replace(
  /(\{\/\* MY TIMETABLE VIEW \*\/\}\s*\n\{view === "timetable" && \(\s*\n\s*<TimetableView[\s\S]*?classAlerts=\{classAlerts\}\s*\/>)/,
  '$1\n</ErrorBoundary>'
);
t = t.replace(
  /(\{\/\* MY TIMETABLE VIEW \*\/\}\s*\n\{view === "timetable" && \(\s*\n)/,
  '$1<ErrorBoundary label="My Timetable">\n'
);

// REPORTS
t = t.replace(
  /(\{\/\* REPORT CARDS VIEW \*\/\}\s*\n\{view === "reports" && \(\s*\n\s*<ReportsView[\s\S]*?classArm=\{classArm\}\s*\/>)/,
  '$1\n</ErrorBoundary>'
);
t = t.replace(
  /(\{\/\* REPORT CARDS VIEW \*\/\}\s*\n\{view === "reports" && \(\s*\n)/,
  '$1<ErrorBoundary label="Report Cards">\n'
);

// SCHEME
t = t.replace(
  /(\{\/\* SCHEME OF WORK VIEW \*\/\}\s*\n\{view === "scheme" && \(\s*\n\s*<SchemeView[^/]*\/>)/,
  '$1\n</ErrorBoundary>'
);
t = t.replace(
  /(\{\/\* SCHEME OF WORK VIEW \*\/\}\s*\n\{view === "scheme" && \(\s*\n)/,
  '$1<ErrorBoundary label="Scheme of Work">\n'
);

// RESOURCES
t = t.replace(
  /(\{\/\* RESOURCES VIEW \*\/\}\s*\n\{view === "resources" && \(\s*\n\s*<ResourcesTab[^/]*\/>)/,
  '$1\n</ErrorBoundary>'
);
t = t.replace(
  /(\{\/\* RESOURCES VIEW \*\/\}\s*\n\{view === "resources" && \(\s*\n)/,
  '$1<ErrorBoundary label="Resources">\n'
);

// MATRIX
t = t.replace(
  /(\{\/\* GRADING MATRIX VIEW \*\/\}\s*\n\{view === "matrix" && \(\s*\n\s*<MatrixView[\s\S]*?setAddModal=\{setAddModal\}\s*\/>)/,
  '$1\n</ErrorBoundary>'
);
t = t.replace(
  /(\{\/\* GRADING MATRIX VIEW \*\/\}\s*\n\{view === "matrix" && \(\s*\n)/,
  '$1<ErrorBoundary label="Grading Matrix">\n'
);

fs.writeFileSync("src/app/teacher/dashboard/page.js", t);
const teacherCount = (t.match(/ErrorBoundary/g) || []).length;
console.log(`Teacher dashboard: ${teacherCount} ErrorBoundary refs`);

// === STUDENT DASHBOARD ===
let s = fs.readFileSync("src/app/student/dashboard/page.js", "utf8");

// Add import
if (!s.includes('import ErrorBoundary')) {
  s = s.replace(
    'import ReportCardModal from "@/components/ReportCardModal";',
    'import ReportCardModal from "@/components/ReportCardModal";\nimport ErrorBoundary from "@/components/ErrorBoundary";'
  );
}

// Wrap {view === "timetable" && (...)} block
// The timetable block starts at line ~276 with a div wrapping everything
// Find: {view === "timetable" && (\n            <div className="animate-fade-up">
// End:  </div>\n          )}
// We need to wrap the inner content in ErrorBoundary

// Student timetable view
s = s.replace(
  /(\{view === "timetable" && \(\s*\n\s*<div className="animate-fade-up">)/,
  '$1\n<ErrorBoundary label="My Timetable">'
);
// Find the matching close for timetable - it's the }); on its own line after the timetable content
// The pattern is: </div>\n          )}
// Let's be more specific: find the closing of the timetable block
s = s.replace(
  /(\{view === "timetable" && \(\s*\n\s*<div className="animate-fade-up">[\s\S]*?)(\s*<\/div>\s*\n\s*\))/,
  "$1\n</ErrorBoundary>$2"
);

// Student report view
s = s.replace(
  /(\{view === "report" && \(\s*\n\s*<>\s*\n)/,
  '$1<ErrorBoundary label="Report Card">'
);
// Find the close: </>\n          )}
s = s.replace(
  /(\{view === "report" && \(\s*\n\s*<>\s*\n[\s\S]*?)(\s*<\/>\s*\n\s*\))/,
  "$1\n</ErrorBoundary>$2"
);

// Student resources view
s = s.replace(
  /(\{view === "resources" && \(\s*\n\s*<ResourcesView[^/]*\/>)/,
  '$1\n</ErrorBoundary>'
);
s = s.replace(
  /(\{view === "resources" && \(\s*\n)/,
  '$1<ErrorBoundary label="Resources">\n'
);

fs.writeFileSync("src/app/student/dashboard/page.js", s);
const studentCount = (s.match(/ErrorBoundary/g) || []).length;
console.log(`Student dashboard: ${studentCount} ErrorBoundary refs`);

// === PARENT DASHBOARD ===
let p = fs.readFileSync("src/app/parent/dashboard/page.js", "utf8");

// Add import
if (!p.includes('import ErrorBoundary')) {
  p = p.replace(
    'import PaymentHistory from "@/components/parent/PaymentHistory";',
    'import PaymentHistory from "@/components/parent/PaymentHistory";\nimport ErrorBoundary from "@/components/ErrorBoundary";'
  );
}

// Parent has major content sections:
// 1. Children/fee summary section (line ~259-440)
// 2. Selected child detail (line ~440-700)
// 3. Messaging panel (line ~706)
// 4. GDPR buttons (line ~710-732)
// 5. Attendance/GradeTrends/PaymentHistory grid (line ~733-740)

// Wrap MessagingPanel
p = p.replace(
  /(\{\/\* Messaging \*\/\}\s*\n\s*\{session \&\& \()/,
  '$1<ErrorBoundary label="Messaging">'
);
p = p.replace(
  /(<MessagingPanel session=\{session\} \/>\s*\n\s*\))/,
  '$1\n</ErrorBoundary>'
);

// Wrap AttendanceCalendar + GradeTrends + PaymentHistory grid
p = p.replace(
  /(\{\/\* Parent dashboard enhancements \*\/\}\s*\n\s*\{selected \&\& \()/,
  '$1<ErrorBoundary label="Analytics">'
);
// The grid closes with )} right after PaymentHistory
p = s.includes("ErrorBoundary") ? p : p; // no-op safety

// Find the closing of the analytics grid
p = p.replace(
  /(<PaymentHistory studentId=\{selected\.id\} studentName=\{selected\.name\} \/>\s*\n\s*<\/div>\s*\n\s*\))/,
  '$1\n</ErrorBoundary>'
);

fs.writeFileSync("src/app/parent/dashboard/page.js", p);
const parentCount = (p.match(/ErrorBoundary/g) || []).length;
console.log(`Parent dashboard: ${parentCount} ErrorBoundary refs`);
