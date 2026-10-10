import type { CSSProperties } from "react";

/**
 * 骨架屏：米色 shimmer 占位，与真实卡片同尺寸，避免白屏与布局跳动。
 * 样式见 styles.css 末尾「App 级体验层」区块（.sk-*）。
 */

export function SkBlock({ style }: { style?: CSSProperties }) {
  return <div className="sk-block" style={style} aria-hidden="true" />;
}

/** 首页 9 卡 bento 骨架：复用 .bento-grid/.bento-row 网格，几何与真卡一致 */
export function HomeSkeleton() {
  const rows = [
    { className: "bento-row top-row", cells: ["hero", "a", "b"] },
    { className: "bento-row middle-row", cells: ["c", "d", "e"] },
    { className: "bento-row bottom-row", cells: ["f", "g", "h"] },
  ];
  return (
    <div className="sk-page" role="status" aria-label="正在加载首页">
      <div className="bento-grid" aria-hidden="true">
        {rows.map((row) => (
          <div key={row.className} className={row.className}>
            {row.cells.map((cell, i) => (
              <div key={cell} className="card sk-card">
                {cell === "hero" ? (
                  <>
                    <SkBlock style={{ width: "34%", height: 14 }} />
                    <SkBlock
                      style={{ width: "86%", height: 44, marginTop: 18 }}
                    />
                    <SkBlock
                      style={{ width: "64%", height: 44, marginTop: 10 }}
                    />
                    <SkBlock
                      style={{ width: "46%", height: 18, marginTop: 22 }}
                    />
                    <div
                      style={{ display: "flex", gap: 10, marginTop: "auto" }}
                    >
                      <SkBlock style={{ width: 128, height: 44 }} />
                      <SkBlock style={{ width: 128, height: 44 }} />
                    </div>
                  </>
                ) : (
                  <>
                    <SkBlock style={{ width: "40%", height: 12 }} />
                    <SkBlock
                      style={{ width: "92%", height: 20, marginTop: 16 }}
                    />
                    <SkBlock
                      style={{ width: "70%", height: 20, marginTop: 8 }}
                    />
                    {i % 2 === 0 && (
                      <SkBlock
                        style={{ width: "100%", height: 84, marginTop: 14 }}
                      />
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** 课程页骨架：Hero + 课时列表占位 */
export function CourseSkeleton() {
  return (
    <div
      className="sk-page sk-course"
      role="status"
      aria-label="正在加载课程"
    >
      <div className="sk-course-hero" aria-hidden="true">
        <SkBlock style={{ width: 150, height: 14, margin: "0 auto" }} />
        <SkBlock style={{ width: "52%", height: 38, margin: "18px auto 0" }} />
        <SkBlock style={{ width: 190, height: 190, margin: "26px auto 0" }} />
        <div
          style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 22 }}
        >
          <SkBlock style={{ width: 150, height: 48 }} />
          <SkBlock style={{ width: 150, height: 48 }} />
        </div>
      </div>
      <div className="sk-course-list" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="sk-lesson-row">
            <SkBlock style={{ width: 26, height: 16 }} />
            <SkBlock style={{ width: 46, height: 46 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <SkBlock style={{ width: `${72 - i * 6}%`, height: 18 }} />
              <SkBlock style={{ width: "44%", height: 13, marginTop: 8 }} />
            </div>
            <SkBlock style={{ width: 52, height: 32 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** 社区动态骨架：与 .community-memo 同尺寸的占位卡 */
export function MemoSkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div role="status" aria-label="正在载入大家的分享">
      {Array.from({ length: count }, (_, i) => (
        <article key={i} className="community-memo sk-memo" aria-hidden="true">
          <div className="community-memo-head">
            <SkBlock style={{ width: 40, height: 40, borderRadius: "50%" }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <SkBlock style={{ width: "32%", height: 15 }} />
              <SkBlock style={{ width: "22%", height: 12, marginTop: 6 }} />
            </div>
          </div>
          <SkBlock style={{ width: "96%", height: 16 }} />
          <SkBlock style={{ width: "78%", height: 16, marginTop: 8 }} />
          <div
            style={{ display: "flex", gap: 8, marginTop: 14 }}
          >
            <SkBlock style={{ width: 64, height: 32 }} />
            <SkBlock style={{ width: 64, height: 32 }} />
            <SkBlock style={{ width: 64, height: 32 }} />
          </div>
        </article>
      ))}
    </div>
  );
}
