import { redirect } from "next/navigation";

// The app is the Living Tutor; send the root straight there.
export default function Home() {
  redirect("/tutor");
}
