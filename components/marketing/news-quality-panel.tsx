import {Eyebrow} from "@/components/wt/eyebrow";

export type NewsQualityPanelLabels = Readonly<{eyebrow: string; title: string; body: string}>;

export function NewsQualityPanel({labels}: Readonly<{labels: NewsQualityPanelLabels}>) {
  return (
    <div className="news-quality-panel">
      <Eyebrow>{labels.eyebrow}</Eyebrow>
      <h2>{labels.title}</h2>
      <p>{labels.body}</p>
    </div>
  );
}
