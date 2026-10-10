export function SiteFooter({
onCourses,
onTeacher,
onContact,
}: {
onCourses?: () => void;
onTeacher?: () => void;
onContact?: () => void;
} = {}) {
return (
<footer className="site-footer" aria-label="页脚">
<div className="site-footer-grid">
<div className="site-footer-brand">
<strong>My Blog</strong>
<p>愿助你忆起生命的奇迹</p>
</div>
<nav className="site-footer-links" aria-label="快速链接">
<strong>快速链接</strong>
<button type="button" onClick={onCourses}>
冥想课程
</button>
<button type="button" onClick={onTeacher}>
师资介绍
</button>
<button type="button" onClick={onContact}>
联系我们
</button>
</nav>
<div className="site-footer-contact">
<strong>联系方式</strong>
<p>微信公众号：</p>
<p>微信号：</p>
<p>小红书：</p>
<p>B 站：</p>
</div>
</div>
<div className="site-footer-bottom">© 2026 My Blog</div>
</footer>
);
}
