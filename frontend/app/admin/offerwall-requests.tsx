import React from "react";

import {
  RequestReview,
  ReviewItem,
} from "@/src/components/admin/RequestReview";
import { adminSubmissions, setSubmissionStatus, OfferStatus } from "@/src/lib/firestore";
import { formatRupees } from "@/src/utils/format";

export default function AdminOfferwallRequests() {
  const load = async (key: string): Promise<ReviewItem[]> => {
    const rows = await adminSubmissions(key as OfferStatus);
    return rows.map((s) => ({
      id: s.id,
      title: `${s.name} • ${s.mobile}`,
      subtitle: `${s.taskTitle} • ${formatRupees(s.reward)}`,
      proof: s.proof,
      reason: s.reason,
    }));
  };

  return (
    <RequestReview
      heading="Offerwall Requests"
      categories={[
        { key: "pending", label: "Pending" },
        { key: "approved", label: "Approved" },
        { key: "rejected", label: "Rejected" },
      ]}
      load={load}
      onApprove={(id) => setSubmissionStatus(id, "approved")}
      onReject={(id, reason) => setSubmissionStatus(id, "rejected", reason)}
    />
  );
}
