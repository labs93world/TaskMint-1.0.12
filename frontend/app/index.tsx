import { Redirect } from "expo-router";

import { useUser } from "@/src/context/UserContext";
import { HomeSkeleton } from "@/src/components/HomeSkeleton";

export default function Index() {
  const { ready, onboarded } = useUser();

  // Show the Home skeleton immediately on launch instead of a spinner.
  if (!ready) {
    return <HomeSkeleton />;
  }

  return <Redirect href={onboarded ? "/(tabs)" : "/login"} />;
}
