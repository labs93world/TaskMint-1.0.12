import React from "react";
import { LegalScreen } from "@/src/components/LegalScreen";

export default function Terms() {
  return (
    <LegalScreen
      title="Terms of Use"
      sections={[
        {
          heading: "1. Acceptance of Terms",
          body: "By downloading, accessing, or using TaskMint, you agree to be bound by these Terms of Use. If you do not agree, please do not use the app.",
        },
        {
          heading: "2. Earning Rewards",
          body: "TaskMint lets you earn points by completing offerwall tasks, playing mini-games, and daily check-ins. Points are credited only after a task is reviewed and approved. Rewards shown are indicative and may vary based on the advertiser.",
        },
        {
          heading: "3. Points & Withdrawals",
          body: "1000 points equal ₹1. The minimum withdrawal amount is ₹20. Withdrawal requests are processed after verification. We reserve the right to reject fraudulent, duplicate, or incomplete submissions.",
        },
        {
          heading: "4. Fair Use",
          body: "Any attempt to manipulate tasks, use bots, create multiple accounts, or submit fake proofs will result in forfeiture of points and a permanent ban without prior notice.",
        },
        {
          heading: "5. Internet Requirement",
          body: "TaskMint requires an active internet connection to function. Your profile and balance are stored locally on your device.",
        },
        {
          heading: "6. Changes to Terms",
          body: "We may update these Terms from time to time. Continued use of the app after changes constitutes acceptance of the revised Terms.",
        },
        {
          heading: "7. Contact",
          body: "For any questions about these Terms, contact us at taskmint93@gmail.com.",
        },
      ]}
    />
  );
}
