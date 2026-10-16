import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";
export function draftFactLabels(locale: "en" | "zh-HK") {
  return locale === "zh-HK" ? zh.aiDraftFacts : en.aiDraftFacts;
}
