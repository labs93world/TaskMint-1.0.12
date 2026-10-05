import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";

import { makeStyles } from "@/src/theme";
import { Button } from "@/src/components/ui/Button";
import { useToast } from "@/src/components/ui/Toast";
import { Field, ToggleRow } from "./BannersManager";
import { getConfig, setConfig } from "@/src/lib/firestore";

export function ForceUpdateManager() {
  const styles = useStyles();
  const toast = useToast();
  const q = useQuery({ queryKey: ["admin-config"], queryFn: () => getConfig() });

  const [forceUpdate, setForceUpdate] = useState(false);
  const [latestVersion, setLatestVersion] = useState("1.0.0");
  const [updateUrl, setUpdateUrl] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (q.data) {
      setForceUpdate(!!q.data.forceUpdate);
      setLatestVersion(q.data.latestVersion || "1.0.0");
      setUpdateUrl(q.data.updateUrl || "");
      setMessage(q.data.message || "");
    }
  }, [q.data]);

  const save = async () => {
    setSaving(true);
    try {
      await setConfig({ forceUpdate, latestVersion: latestVersion.trim(), updateUrl: updateUrl.trim(), message: message.trim() });
      toast.show("Update settings saved", "success");
    } catch {
      toast.show("Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View>
      <View style={styles.card}>
        <Text style={styles.note}>
          When enabled, users on an older version than the latest will be forced
          to update before using the app.
        </Text>
        <ToggleRow label="Force update enabled" value={forceUpdate} onChange={setForceUpdate} />
        <Field label="Latest version" value={latestVersion} onChange={setLatestVersion} placeholder="1.0.1" />
        <Field label="Play Store URL" value={updateUrl} onChange={setUpdateUrl} placeholder="https://play.google.com/..." />
        <Field label="Update message" value={message} onChange={setMessage} placeholder="A new version is available!" multiline />
        <Button label="Save settings" loading={saving} onPress={save} style={{ marginTop: 18 }} testID="force-update-save" />
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  card: { backgroundColor: c.surfaceSecondary, borderRadius: 16, padding: 16 },
  note: { fontSize: 13, color: c.muted, lineHeight: 20, fontWeight: "600" },
}));
