import { ScrollView, Text, View } from "react-native";
import { space } from "@/lib/theme";
import { useTheme } from "@/lib/theme-context";

const UPDATED = "16 October 2026";
const CONTACT = "supportdevhostel@gmail.com";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: space(2) }}>
      <Text style={{ fontSize: 17, fontWeight: "700", color: colors.text }}>{title}</Text>
      <Text style={{ fontSize: 15, lineHeight: 22, color: colors.text }}>{children}</Text>
    </View>
  );
}

export default function PrivacyPolicy() {
  const { colors } = useTheme();
  return (
    <ScrollView
      contentContainerStyle={{
        padding: space(4),
        gap: space(4),
        width: "100%",
        maxWidth: 760,
        alignSelf: "center",
      }}
    >
      <View style={{ gap: space(1) }}>
        <Text style={{ fontSize: 26, fontWeight: "800", color: colors.text }}>Privacy Policy</Text>
        <Text style={{ color: colors.muted }}>Dev Hostel · Last updated {UPDATED}</Text>
      </View>

      <Section title="Overview">
        Dev Hostel is a hostel and PG management app used by owners, staff, guards, students and
        parents. This policy explains what information we collect, why we collect it, and the
        choices you have.
      </Section>

      <Section title="Information we collect">
        Account details (name, email address, phone number, role); hostel/tenant profile and room
        records; student records (name, room, contact and guardian details); fee invoices and
        payment records; attendance/check-in and check-out times; and short (about 6-second)
        check-in/check-out videos captured at the gate. We also collect a device push token so we
        can send notifications, and basic technical data needed to operate the service.
      </Section>

      <Section title="How we use information">
        To run the hostel — managing students, rooms, fees, approvals and leaves; to show parents
        and guardians their child&apos;s check-in/check-out activity; to send relevant notifications
        and, for hostel owners, password-reset emails; and to keep the service secure and working
        correctly.
      </Section>

      <Section title="Media and camera">
        The app asks for camera and microphone access only to record check-in/check-out videos when
        a staff member or guard chooses to record. Only the most recent clip for each student is
        kept; older clips are deleted automatically. Videos are stored securely and shared only with
        the owner, authorised staff, and the student&apos;s linked parent/guardian.
      </Section>

      <Section title="Service providers">
        We rely on trusted providers to operate the app: cloud hosting, a managed database, media
        storage, email delivery, and push-notification delivery. These providers process data only
        on our behalf and only as needed to provide their service.
      </Section>

      <Section title="Data retention">
        We keep information for as long as the hostel account is active and as needed to provide the
        service, meet legal obligations, resolve disputes and enforce agreements. Check-in/out videos
        are replaced by newer clips automatically as described above.
      </Section>

      <Section title="Security">
        Data is sent over encrypted HTTPS connections and access is limited by account role. No
        method of transmission or storage is completely secure, so we cannot guarantee absolute
        security.
      </Section>

      <Section title="Children's privacy">
        The app is intended for use by hostel administrators, staff and adults, and for guardians to
        view their own child&apos;s activity. It is not directed at children to use on their own. Where
        student information is entered, it is provided by the hostel or guardian.
      </Section>

      <Section title="Your choices">
        You can request access to, correction of, or deletion of your personal information, and you
        can ask us to stop sending non-essential notifications. Contact us using the details below.
      </Section>

      <Section title="Changes to this policy">
        We may update this policy from time to time. Material changes will be reflected by the
        &quot;last updated&quot; date above.
      </Section>

      <Section title="Contact us">
        Questions about this policy or your data? Email {CONTACT}.
      </Section>
    </ScrollView>
  );
}
