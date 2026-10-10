/**
* 师资页（"为什么跟我学"）架子。
* =====================================================================
* 需要用户提供的真实资料清单（拿到后替换下方占位符）：
* 1. 头像/形象照：一张高清个人照片（建议 800x800 以上）
* 2. 真实身份：一句话身份，如"正念冥想引导师 / 心理咨询师"
* 3. 修习经历：学了多久、师从何人、有无认证（如 MBSR/MBCT 师资）
* 4. 教学经历：带过多少学员、开过哪些课、有无线下工作坊
* 5. 教学理念：1-2 句话，为什么这样教
* 6. 学员反馈：2-3 条真实学员评价（需学员本人同意，需署名或化名+城市）
* 注意：绝不编造社会证明，占位符必须等用户提供真实资料后替换。
* =====================================================================
*/
import "./course-system.css";

export function TeacherPage() {
return (
<div className="teacher-page">
<section className="teacher-hero">
<p className="eyebrow">TEACHER</p>
<h1>为什么跟我学</h1>
</section>

<section className="teacher-profile">
<div className="teacher-avatar-placeholder" aria-label="头像占位">
<span></span>
</div>
<h2></h2>
<p className="teacher-tagline"></p>
</section>

<section className="teacher-section">
<h3>修习经历</h3>
<p></p>
</section>

<section className="teacher-section">
<h3>教学经历</h3>
<p></p>
</section>

<section className="teacher-section">
<h3>教学理念</h3>
<p></p>
</section>

<section className="teacher-section">
<h3>学员反馈</h3>
<ul className="teacher-feedback">
<li></li>
<li></li>
<li></li>
</ul>
</section>
</div>
);
}
