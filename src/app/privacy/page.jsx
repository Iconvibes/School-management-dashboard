import Link from "next/link";
import SiteNav from "@/components/marketing/SiteNav";
import SiteFooter from "@/components/marketing/SiteFooter";

export const metadata = {
  title: "Privacy Policy — EduTrack",
  description:
    "How EduTrack collects, uses, stores and protects personal data for schools, teachers, students and parents. GDPR and NDPR compliant.",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="flex-1 overflow-x-clip bg-white">
      <SiteNav />

      <div className="mx-auto max-w-3xl px-5 py-16 lg:py-24">
        <h1 className="text-4xl font-extrabold tracking-tight text-navy-800">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-navy-400">
          Effective date: 20 August 2026 · Last updated: 20 August 2026
        </p>

        <div className="prose prose-navy mt-10 space-y-10 text-navy-600 leading-relaxed">
          {/* 1 */}
          <section>
            <h2 className="text-xl font-bold text-navy-800">
              1. Who we are
            </h2>
            <p>
              EduTrack (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) is a
              school management platform operated for educational institutions
              in Nigeria and other jurisdictions. We act as a{" "}
              <strong>data processor</strong> on behalf of schools (the{" "}
              <strong>data controllers</strong>) that register and use our
              service.
            </p>
            <p>
              For data-protection purposes, the school that registers with
              EduTrack is the data controller responsible for deciding how
              personal data about its students, parents, teachers and staff is
              collected and used. EduTrack processes that data only on the
              school&apos;s documented instructions.
            </p>
          </section>

          {/* 2 */}
          <section>
            <h2 className="text-xl font-bold text-navy-800">
              2. What personal data we collect
            </h2>
            <p>
              Depending on your role, we may collect and process the following
              categories of personal data:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Account information:</strong> name, email address, phone
                number, role (admin, teacher, student, parent, bursar, registrar).
              </li>
              <li>
                <strong>Academic data:</strong> class/arm assignments, subjects
                taught, examination scores, continuous assessment (CA) scores,
                class positions, attendance records, report card data.
              </li>
              <li>
                <strong>Financial data:</strong> fee structures, payment records,
                receipts, outstanding balances, fee audit trails.
              </li>
              <li>
                <strong>Communication data:</strong> in-app notifications,
              messages between users, push notification subscriptions, digest
                preferences.
              </li>
              <li>
                <strong>Operational data:</strong> timetables, schemes of work,
                class resources, school settings, lead/marketing enquiries.
              </li>
              <li>
                <strong>Technical data:</strong> session cookies (HTTP-only,
                for authentication), browser user-agent strings (for push
                notification management).
              </li>
            </ul>
            <p className="mt-4">
              We <strong>do not</strong> collect biometric data, government-issued
              ID numbers, health records, or any special category data under GDPR
              Article 9.
            </p>
          </section>

          {/* 3 */}
          <section>
            <h2 className="text-xl font-bold text-navy-800">
              3. How we use personal data
            </h2>
            <p>We process personal data for the following purposes:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Providing the service:</strong> operating the school
                management platform — recording grades, attendance, fees,
                timetables and generating report cards.
              </li>
              <li>
                <strong>Authentication and security:</strong> verifying user
                identity, enforcing role-based access controls, detecting
                suspicious login attempts.
              </li>
              <li>
                <strong>Communication:</strong> sending fee reminders,
                announcements, report card notifications and class alerts to
                users via their chosen channels (in-app, email, SMS, or
                WhatsApp).
              </li>
              <li>
                <strong>Legal obligation:</strong> maintaining records required
                by educational regulations.
              </li>
              <li>
                <strong>Service improvement:</strong> aggregated, anonymised
                analytics to improve platform reliability and usability.
              </li>
            </ul>
          </section>

          {/* 4 */}
          <section>
            <h2 className="text-xl font-bold text-navy-800">
              4. Legal basis for processing
            </h2>
            <p>
              We process personal data under the following legal bases as defined
              in GDPR Article 6 and the Nigeria Data Protection Regulation (NDPR)
              2019:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Consent (Art. 6(1)(a)):</strong> parents consent to the
                processing of their children&apos;s data when they enrol their
                child at a school that uses EduTrack. Teachers and staff consent
                when they accept an invitation to use the platform.
              </li>
              <li>
                <strong>Contractual necessity (Art. 6(1)(b)):</strong> processing
                is necessary for the school to fulfil its educational contract
                with parents (recording grades, attendance, issuing report
                cards).
              </li>
              <li>
                <strong>Legal obligation (Art. 6(1)(c)):</strong> schools are
                required by Nigerian education regulations to maintain academic
                records.
              </li>
              <li>
                <strong>Legitimate interest (Art. 6(1)(f)):</strong> platform
                security, fraud prevention and service improvement, balanced
                against the data subject&apos;s rights.
              </li>
            </ul>
          </section>

          {/* 5 */}
          <section>
            <h2 className="text-xl font-bold text-navy-800">
              5. How we protect your data
            </h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Encryption at rest:</strong> all personally identifiable
                information (email addresses, phone numbers) is encrypted using
                AES-256-GCM field-level encryption. A data breach would expose
                only ciphertext.
              </li>
              <li>
                <strong>Encryption in transit:</strong> all data is transmitted
                over TLS (HTTPS).
              </li>
              <li>
                <strong>Password hashing:</strong> passwords are hashed with
                bcrypt and are never stored in plaintext.
              </li>
              <li>
                <strong>Tenant isolation:</strong> each school&apos;s data is
                logically and physically separated. One school can never access
                another school&apos;s data.
              </li>
              <li>
                <strong>Role-based access control:</strong> every user sees only
                the data permitted by their role. Teachers see only their
                assigned classes. Students see only their own scores.
              </li>
              <li>
                <strong>Daily backups:</strong> encrypted backups with tested
                disaster-recovery procedures.
              </li>
              <li>
                <strong>Automatic session expiry:</strong> authentication
                sessions expire and must be renewed.
              </li>
            </ul>
          </section>

          {/* 6 */}
          <section>
            <h2 className="text-xl font-bold text-navy-800">
              6. Data retention
            </h2>
            <p>
              We retain personal data only for as long as necessary to provide
              the service:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Active accounts:</strong> data is retained while the
                school&apos;s account is active and the user is enrolled or
                employed.
              </li>
              <li>
                <strong>Archived terms:</strong> academic records from previous
                terms are archived separately and retained for the school&apos;s
                configured retention period.
              </li>
              <li>
                <strong>Notification history:</strong> notifications older than
                the school&apos;s configured retention window (default: 90 days)
                are moved to an archived view.
              </li>
              <li>
                <strong>Deleted users:</strong> when a user is deleted, their
                personal data (scores, attendance, payments) is permanently
                removed from the system.
              </li>
              <li>
                <strong>School deletion:</strong> when a school account is
                deleted, all associated data is permanently removed after a
                30-day grace period.
              </li>
              <li>
                <strong>Audit logs:</strong> fee audit and role-change audit
                entries are retained for the school&apos;s operational needs.
              </li>
            </ul>
          </section>

          {/* 7 */}
          <section>
            <h2 className="text-xl font-bold text-navy-800">
              7. Your rights (GDPR Articles 15–22 &amp; NDPR)
            </h2>
            <p>
              Depending on your jurisdiction, you have the following rights
              regarding your personal data:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Right of access (Art. 15):</strong> you may request a
                copy of all personal data we hold about you. Use the &quot;Export
                My Data&quot; feature in your dashboard, or contact your
                school&apos;s administrator.
              </li>
              <li>
                <strong>Right to rectification (Art. 16):</strong> you may
                request correction of inaccurate personal data through your
                school administrator.
              </li>
              <li>
                <strong>Right to erasure (Art. 17):</strong> you may request
                deletion of your personal data. Submit an erasure request from
                your dashboard. Your school administrator will review and
                approve it.
              </li>
              <li>
                <strong>Right to restrict processing (Art. 18):</strong> you may
                request that we limit how your data is used.
              </li>
              <li>
                <strong>Right to data portability (Art. 20):</strong> you may
                receive your data in a structured, machine-readable format
                (JSON).
              </li>
              <li>
                <strong>Right to object (Art. 21):</strong> you may object to
                processing based on legitimate interests.
              </li>
              <li>
                <strong>Right to withdraw consent (Art. 7(3)):</strong> where
                processing is based on consent, you may withdraw it at any time
                by requesting account deletion.
              </li>
            </ul>
          </section>

          {/* 8 */}
          <section>
            <h2 className="text-xl font-bold text-navy-800">
              8. Data sharing and third parties
            </h2>
            <p>
              We do <strong>not</strong> sell, rent or trade personal data. We do
              not share personal data with third parties except:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>On the school&apos;s instruction:</strong> when a school
                configures email, SMS or WhatsApp integrations, notification
                content is delivered through those third-party transport
                providers (e.g. email providers, SMS gateways, the Meta Cloud
                API for WhatsApp). The minimum necessary data (recipient
                contact, message content) is shared for delivery purposes only.
              </li>
              <li>
                <strong>Legal requirement:</strong> where we are legally required
                to disclose personal data (e.g. a court order).
              </li>
              <li>
                <strong>Service providers:</strong> we use cloud hosting
                infrastructure providers who act as data sub-processors under
                written agreements that include GDPR-standard data protection
                clauses.
              </li>
            </ul>
          </section>

          {/* 9 */}
          <section>
            <h2 className="text-xl font-bold text-navy-800">
              9. International data transfers
            </h2>
            <p>
              EduTrack is hosted on cloud infrastructure. If data is transferred
              outside Nigeria or the European Economic Area (EEA), we ensure
              appropriate safeguards are in place, including Standard Contractual
              Clauses (SCCs) or equivalent mechanisms as required by the NDPR
              and GDPR.
            </p>
          </section>

          {/* 10 */}
          <section>
            <h2 className="text-xl font-bold text-navy-800">
              10. Data breach notification
            </h2>
            <p>
              In the event of a personal data breach that is likely to result in
              a risk to the rights and freedoms of individuals, we will:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Notify the relevant supervisory authority within <strong>72
                hours</strong> of becoming aware of the breach (GDPR Art. 33).
              </li>
              <li>
                Notify affected data subjects without undue delay where the
                breach is likely to result in a high risk (GDPR Art. 34).
              </li>
              <li>
                Document the breach, its effects, and the remedial actions
                taken.
              </li>
            </ul>
          </section>

          {/* 11 */}
          <section>
            <h2 className="text-xl font-bold text-navy-800">
              11. Children&apos;s data
            </h2>
            <p>
              EduTrack processes data about students (who may be minors) solely
              at the instruction of the school and with the consent of the
              student&apos;s parent or legal guardian. Schools are responsible for
              obtaining and documenting parental consent before enrolling
              students on the platform. Parents can view, export or request
              deletion of their child&apos;s data at any time.
            </p>
          </section>

          {/* 12 */}
          <section>
            <h2 className="text-xl font-bold text-navy-800">
              12. Cookies
            </h2>
            <p>
              EduTrack uses a single HTTP-only session cookie
              (<code>edutrack_token</code>) for authentication. This cookie:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Is strictly necessary for the service to function.</li>
              <li>Is not used for tracking, advertising or analytics.</li>
              <li>Cannot be accessed by JavaScript on the page.</li>
              <li>Expires after the session timeout period.</li>
            </ul>
            <p>
              We do <strong>not</strong> use third-party tracking cookies,
              advertising cookies or analytics cookies.
            </p>
          </section>

          {/* 13 */}
          <section>
            <h2 className="text-xl font-bold text-navy-800">
              13. Changes to this policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. Material
              changes will be communicated to school administrators via email or
              in-app notification. The &quot;Last updated&quot; date at the top of
              this page reflects the most recent revision.
            </p>
          </section>

          {/* 14 */}
          <section>
            <h2 className="text-xl font-bold text-navy-800">
              14. Contact us
            </h2>
            <p>
              For questions about this Privacy Policy or to exercise your data
              protection rights, please contact:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>
                <strong>Email:</strong>{" "}
                <a
                  href="mailto:privacy@edutrack.app"
                  className="text-brand-600 underline"
                >
                  privacy@edutrack.app
                </a>
              </li>
              <li>
                <strong>Or through your school administrator</strong> who can
                submit data requests on your behalf.
              </li>
            </ul>
          </section>
        </div>

        <div className="mt-16 border-t border-navy-100 pt-8 text-center text-sm text-navy-400">
          <Link href="/" className="text-brand-600 hover:underline">
            ← Back to EduTrack
          </Link>
        </div>
      </div>

      <SiteFooter />
    </main>
  );
}
