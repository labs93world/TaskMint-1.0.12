import React from "react";
import { LegalScreen } from "@/src/components/LegalScreen";

export default function Privacy() {
  return (
    <LegalScreen
      title="Privacy Policy"
      sections={[
        {
          heading: "1. Information We Store",
          body: "Your name, mobile number, points balance, and transaction history are stored locally on your own device. We do not maintain personal user accounts on our servers.",
        },
        {
          heading: "2. Information Sent for Requests",
          body: "When you submit a withdrawal or a task proof, your name, mobile number, amount, payment detail (UPI/Bank), and proof are sent to our secure cloud so our team can review and process your request.",
        },
        {
          heading: "3. Advertising",
          body: "TaskMint displays ads via Google AdMob. AdMob may collect device identifiers to serve relevant ads. Please review Google's privacy policy for details.",
        },
        {
          heading: "4. Data Security",
          body: "We use industry-standard measures to protect request data. However, no method of transmission over the internet is 100% secure.",
        },
        {
          heading: "5. Children's Privacy",
          body: "TaskMint is not intended for users under 18. We do not knowingly collect data from children.",
        },
        {
          heading: "6. Your Choices",
          body: "You can clear all locally stored data at any time by uninstalling the app. To request deletion of any submitted request data, email us.",
        },
        {
          heading: "7. Contact",
          body: "For privacy questions, reach out to taskmint93@gmail.com.",
        },
      ]}
    />
  );
}
