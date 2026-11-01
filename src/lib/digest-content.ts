/** The shape of a saved digest (digests.content), shared by every place that shows or sends one. */
export type DigestContent = {
  headline: string;
  summary: string;
  sections: { heading: string; items: string[] }[];
  quotes: { text: string; by: string }[];
  roadmap: { review: number; planned: number; progress: number; shipped: number };
};
