export default function Processing({
  steps,
  done,
  stage,
  query,
  meta,
}: {
  steps: string[];
  done: boolean;
  stage: 1 | 2 | 3;
  query: string;
  meta?: {
    workflow: "find-item" | "plan-outfit";
    occasion?: string;
    formality?: string;
    season?: string;
    categories?: string[];
    description?: string;
  } | null;
}) {
  const totalStages = 3;
  const completedStages = done ? 3 : stage;
  const progressRatio = completedStages / totalStages;
  const ringRadius = 30;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference * (1 - progressRatio);

  const stageLabels = [
    "Understanding your request",
    "Matching items",
    "Checking availability",
  ];

  const hasError = steps.some((s) => s.startsWith("Something went wrong"));

  return (
    <div className="max-w-lg mx-auto px-8 py-20 text-center flex flex-col items-center justify-center min-h-[450px]">
      {/* Progress ring */}
      <div className="relative mb-8 h-20 w-20">
        <svg className="h-20 w-20 -rotate-90" viewBox="0 0 72 72" aria-hidden="true">
          <circle
            cx="36" cy="36" r={ringRadius}
            fill="none" stroke="currentColor" strokeWidth="5"
            className="text-border"
          />
          <circle
            cx="36" cy="36" r={ringRadius}
            fill="none" stroke="currentColor" strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={ringCircumference}
            strokeDashoffset={ringOffset}
            className="text-text-primary transition-[stroke-dashoffset] duration-500 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-sm font-semibold text-text-primary">
            {done ? "\u2713" : `${completedStages}/${totalStages}`}
          </div>
          <div className="text-[0.55rem] uppercase tracking-[0.14em] text-text-secondary">
            done
          </div>
        </div>
      </div>

      <h2
        className="text-3xl mb-4"
        style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}
      >
        {done ? "Found your looks" : "Styling your outfit\u2026"}
      </h2>

      {hasError ? (
        <p className="text-[0.8rem] text-red-500 mt-2">{steps[0]}</p>
      ) : (
        <>
          {/* Stage checklist */}
          <div className="text-[0.8rem] text-text-secondary leading-7 mb-6">
            {stageLabels.map((label, i) => {
              const stageNum = i + 1;
              const isComplete = done || stageNum < stage;
              const isActive = !done && stageNum === stage;
              return (
                <div key={i} className="flex items-center justify-center gap-2">
                  {isComplete ? (
                    <span className="text-green-600 text-xs">{"\u2713"}</span>
                  ) : isActive ? (
                    <span className="inline-block w-3 h-3 border border-text-secondary/40 border-t-text-primary rounded-full animate-spin" />
                  ) : (
                    <span className="inline-block w-3 h-3 rounded-full border border-text-secondary/20" />
                  )}
                  <span className={isComplete ? "text-text-secondary/60" : isActive ? "text-text-primary font-medium" : "text-text-secondary/30"}>
                    {label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Stage 1 — show query + catalogue size */}
          {stage === 1 && !done && query && (
            <div className="w-full max-w-sm bg-bg-secondary border border-border rounded-sm p-5 text-left animate-[fadeIn_0.3s_ease-in]">
              <div className="text-[0.6rem] tracking-[0.15em] uppercase text-text-secondary/60 mb-3 font-semibold">
                Your query
              </div>
              <p className="text-[0.9rem] text-text-primary mb-4 italic">&ldquo;{query}&rdquo;</p>
              <p className="text-[0.7rem] text-text-secondary">
                Searching 3,766 items across 5 NYC stores&hellip;
              </p>
            </div>
          )}

          {/* Stage 2 — show what GPT detected */}
          {stage === 2 && !done && meta && (
            <div className="w-full max-w-sm bg-bg-secondary border border-border rounded-sm p-5 text-left animate-[fadeIn_0.3s_ease-in]">
              {meta.workflow === "plan-outfit" ? (
                <>
                  <div className="text-[0.6rem] tracking-[0.15em] uppercase text-text-secondary/60 mb-3 font-semibold">
                    Occasion detected
                  </div>
                  <p className="text-[0.9rem] text-text-primary font-medium mb-3 capitalize">
                    {[meta.formality, meta.occasion, meta.season ? `— ${meta.season}` : ""].filter(Boolean).join(" ")}
                  </p>
                  {meta.categories && meta.categories.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {meta.categories.map((cat) => (
                        <span key={cat} className="text-[0.65rem] bg-white border border-border px-2 py-0.5 rounded-sm text-text-primary uppercase tracking-wide">
                          {cat}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="text-[0.6rem] tracking-[0.15em] uppercase text-text-secondary/60 mb-3 font-semibold">
                    Matched
                  </div>
                  <p className="text-[0.9rem] text-text-primary">{meta.description}</p>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
