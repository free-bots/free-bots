// The LOADOUT panel's skills. Add or remove a skill here; `id` is a skillicons.dev id
// (https://github.com/tandpfun/skill-icons#icons-list), `name` the short slot label.
export const SKILL_GROUPS = [
    {
        title: 'LANGUAGES',
        items: [
            { id: 'kotlin', name: 'KOTLIN' },
            { id: 'java', name: 'JAVA' },
            { id: 'ts', name: 'TS' },
            { id: 'js', name: 'JS' },
            { id: 'go', name: 'GO' },
            { id: 'py', name: 'PYTHON' },
            { id: 'cs', name: 'C#' },
            { id: 'php', name: 'PHP' },
            { id: 'bash', name: 'BASH' },
            { id: 'html', name: 'HTML' },
            { id: 'css', name: 'CSS' },
            { id: 'sass', name: 'SASS' },
        ],
    },
    {
        title: 'FRONTEND',
        items: [
            { id: 'angular', name: 'ANGULAR' },
            { id: 'react', name: 'REACT' },
            { id: 'vite', name: 'VITE' },
            { id: 'tailwind', name: 'TAILWIND' },
            { id: 'bootstrap', name: 'BOOTSTRP' },
            { id: 'styledcomponents', name: 'STYLED' },
            { id: 'reactivex', name: 'RXJS' },
            { id: 'electron', name: 'ELECTRON' },
        ],
    },
    {
        title: 'BACKEND & ML',
        items: [
            { id: 'spring', name: 'SPRING' },
            { id: 'hibernate', name: 'HIBERNTE' },
            { id: 'nestjs', name: 'NESTJS' },
            { id: 'nodejs', name: 'NODE' },
            { id: 'dotnet', name: '.NET' },
            { id: 'fastapi', name: 'FASTAPI' },
            { id: 'firebase', name: 'FIREBASE' },
            { id: 'pytorch', name: 'PYTORCH' },
        ],
    },
    {
        title: 'TOOLS & INFRA',
        items: [
            { id: 'androidstudio', name: 'ANDROID' },
            { id: 'docker', name: 'DOCKER' },
            { id: 'git', name: 'GIT' },
            { id: 'github', name: 'GITHUB' },
            { id: 'linux', name: 'LINUX' },
            { id: 'postman', name: 'POSTMAN' },
            { id: 'gulp', name: 'GULP' },
            { id: 'jest', name: 'JEST' },
        ],
    },
];

const iconUrl = (id) => `https://skillicons.dev/icons?i=${encodeURIComponent(id)}`;

// skillicons draws every glyph on a dark rounded tile; drop it so only the glyph is
// pixelated. Tiles in other colors (JS yellow, .NET purple, ...) are part of the logo.
const stripDarkTile = (svg) =>
    svg.replace(/<rect\b(?=[^>]*\bfill="#242938")(?=[^>]*\brx=)[^>]*\/>/i, '');

async function loadIcon(id) {
    try {
        const response = await fetch(iconUrl(id), { signal: AbortSignal.timeout(10000) });
        const svg = await response.text();
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        // unknown ids still answer 200, with the literal text "undefined" as the icon
        if (!svg.includes('<svg') || /<g[^>]*>\s*undefined\s*<\/g>/.test(svg)) throw new Error('unknown icon id');
        return `data:image/svg+xml;base64,${Buffer.from(stripDarkTile(svg)).toString('base64')}`;
    } catch (error) {
        console.warn(`skills: could not load icon "${id}" (${error.message}), using the remote image`);
        return iconUrl(id);
    }
}

export async function loadSkillGroups(groups = SKILL_GROUPS) {
    return Promise.all(
        groups.map(async (group) => ({
            title: group.title,
            count: String(group.items.length).padStart(2, '0'),
            items: await Promise.all(group.items.map(async (item) => ({ ...item, src: await loadIcon(item.id) }))),
        })),
    );
}
