import React from "react";

import {
  RequestReview,
  ReviewItem,
} from "@/src/components/admin/RequestReview";
import { adminPayouts, setPayoutStatus, ReqStatus } from "@/src/lib/firestore";
import { formatRupees } from "@/src/utils/format";

export default function AdminPayouts() {
  const load = async (key: string): Promise<ReviewItem[]> => {
    const rows = await adminPayouts(key as ReqStatus);
    return rows.map((p) => ({
      id: p.id,
      title: `${p.name} • ${p.mobile}`,
      subtitle: `${formatRupees(p.amount)} • ${p.detail}`,
      copyText: p.detail,
      reason: p.reason,
    }));
  };

  return (
    <RequestReview
      heading="Payout Requests"
      categories={[
        { key: "pending", label: "Pending" },
        { key: "successful", label: "Successful" },
        { key: "rejected", label: "Rejected" },
      ]}
      load={load}
      onApprove={(id) => setPayoutStatus(id, "successful")}
      onReject={(id, reason) => setPayoutStatus(id, "rejected", reason)}
    />
  );
}
