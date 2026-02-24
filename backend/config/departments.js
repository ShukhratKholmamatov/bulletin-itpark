// Department configuration registry — single source of truth for workspace tools.
// To tweak a department's tools, edit ONLY this file.

const DEPARTMENT_GROUPS = {
    market_export: {
        name: 'Market & Export',
        departments: ['Product Export', 'Western Markets', 'Eastern Markets', 'IT Outsourcing', 'Global Marketing'],
        color: '#3b82f6',
        icon: 'fa-solid fa-globe-americas'
    },
    investment_startups: {
        name: 'Investment & Startups',
        departments: ['Venture Capital', 'PPP Investors', 'Startup Ecosystem'],
        color: '#8b5cf6',
        icon: 'fa-solid fa-rocket'
    },
    monitoring_relations: {
        name: 'Monitoring & Relations',
        departments: ['BPO Monitoring', 'Residents Relations', 'Residents Registration', 'Residents Monitoring'],
        color: '#f59e0b',
        icon: 'fa-solid fa-chart-bar'
    },
    tech_ai: {
        name: 'Tech & AI',
        departments: ['GovTech', 'AI Infrastructure', 'AI Research', 'Infrastructure', 'Infrastructure Dev'],
        color: '#10b981',
        icon: 'fa-solid fa-microchip'
    },
    marketing_pr: {
        name: 'Marketing & PR',
        departments: ['Marketing', 'Multimedia', 'Public Relations', 'Event Management'],
        color: '#ec4899',
        icon: 'fa-solid fa-bullhorn'
    },
    policy_legal: {
        name: 'Policy & Legal',
        departments: ['Legal Ecosystem', 'Softlanding', 'Analytics'],
        color: '#6366f1',
        icon: 'fa-solid fa-scale-balanced'
    },
    social_regional: {
        name: 'Social & Regional',
        departments: ['Freelancers & Youth', 'Regional Development', 'Inclusive Projects'],
        color: '#14b8a6',
        icon: 'fa-solid fa-people-group'
    }
};

const WIDGET_REGISTRY = {
    news_feed:    { title: 'Department News',     icon: 'fa-solid fa-newspaper',       size: 'full',  dataSource: 'news' },
    ai_brief:     { title: 'AI Daily Brief',      icon: 'fa-solid fa-robot',           size: 'full',  dataSource: 'ai' },
    tracked_companies:    { title: 'Tracked Companies',     icon: 'fa-solid fa-building',        size: 'half', dataSource: 'items', itemType: 'company' },
    deal_pipeline:        { title: 'Deal Pipeline',         icon: 'fa-solid fa-handshake',       size: 'half', dataSource: 'items', itemType: 'deal' },
    startup_tracker:      { title: 'Startup Pipeline',      icon: 'fa-solid fa-rocket',          size: 'half', dataSource: 'items', itemType: 'startup' },
    export_metrics:       { title: 'Export Metrics',        icon: 'fa-solid fa-chart-line',      size: 'third', dataSource: 'stats' },
    investment_metrics:   { title: 'Investment Metrics',    icon: 'fa-solid fa-coins',           size: 'third', dataSource: 'stats' },
    country_comparison:   { title: 'Country Comparison',    icon: 'fa-solid fa-globe',           size: 'half', dataSource: 'stats' },
    resident_kpis:        { title: 'Resident KPIs',         icon: 'fa-solid fa-chart-bar',       size: 'half', dataSource: 'stats' },
    registration_pipeline:{ title: 'Registration Pipeline', icon: 'fa-solid fa-clipboard-list',  size: 'half', dataSource: 'items', itemType: 'registration' },
    tech_trends:          { title: 'Tech Trends',           icon: 'fa-solid fa-microchip',       size: 'half', dataSource: 'news' },
    project_tracker:      { title: 'Project Tracker',       icon: 'fa-solid fa-tasks',           size: 'half', dataSource: 'items', itemType: 'project' },
    event_planner:        { title: 'Event Planner',         icon: 'fa-solid fa-calendar-days',   size: 'half', dataSource: 'items', itemType: 'event' },
    media_mentions:       { title: 'Media Mentions',        icon: 'fa-solid fa-at',              size: 'half', dataSource: 'news' },
    regulatory_tracker:   { title: 'Regulatory Changes',    icon: 'fa-solid fa-gavel',           size: 'half', dataSource: 'nla' },
    community_metrics:    { title: 'Community Metrics',     icon: 'fa-solid fa-people-group',    size: 'third', dataSource: 'stats' },
    // Softlanding-specific widgets
    call_script:          { title: 'Call Scripts',           icon: 'fa-solid fa-phone-volume',    size: 'full',  dataSource: 'spravochnik', category: 'Call Script' },
    spravochnik:          { title: 'Spravochnik (FAQ)',      icon: 'fa-solid fa-book',            size: 'full',  dataSource: 'spravochnik' },
    office_directory:     { title: 'Office Directory',       icon: 'fa-solid fa-location-dot',    size: 'full',  dataSource: 'offices' },
    call_log:             { title: 'Call Log',               icon: 'fa-solid fa-phone-flip',      size: 'full',  dataSource: 'calls' },
    lead_pipeline:        { title: 'Lead Pipeline',          icon: 'fa-solid fa-user-plus',       size: 'half',  dataSource: 'items', itemType: 'lead' }
};

// Per-department configuration: news presets, widgets, tracked item types, AI context
const DEPARTMENT_CONFIG = {
    // ── Market & Export ──
    'Product Export': {
        group: 'market_export',
        newsPresets: { keywords: ['IT export Uzbekistan', 'software outsourcing Central Asia', 'IT Park export'], countries: ['us', 'gb', 'de'] },
        widgets: ['news_feed', 'tracked_companies', 'export_metrics', 'country_comparison', 'ai_brief'],
        trackedItemTypes: ['company', 'lead', 'market'],
        aiPromptContext: 'IT product export from Uzbekistan, software outsourcing markets, IT Park export metrics and target markets'
    },
    'Western Markets': {
        group: 'market_export',
        newsPresets: { keywords: ['IT outsourcing Europe', 'tech market USA UK Germany', 'software development outsourcing'], countries: ['us', 'gb', 'de'] },
        widgets: ['news_feed', 'tracked_companies', 'export_metrics', 'country_comparison', 'ai_brief'],
        trackedItemTypes: ['company', 'lead', 'market'],
        aiPromptContext: 'Western IT markets (USA, UK, EU), outsourcing trends, opportunities for Uzbekistan IT companies in Western markets'
    },
    'Eastern Markets': {
        group: 'market_export',
        newsPresets: { keywords: ['IT market Asia', 'tech outsourcing Japan Korea', 'software market China Southeast Asia'], countries: ['kr', 'jp'] },
        widgets: ['news_feed', 'tracked_companies', 'export_metrics', 'country_comparison', 'ai_brief'],
        trackedItemTypes: ['company', 'lead', 'market'],
        aiPromptContext: 'Eastern IT markets (Japan, South Korea, China, Southeast Asia), tech partnerships and outsourcing demand'
    },
    'IT Outsourcing': {
        group: 'market_export',
        newsPresets: { keywords: ['IT outsourcing trends', 'BPO software development', 'nearshoring offshoring tech'], countries: ['us', 'gb', 'in'] },
        widgets: ['news_feed', 'tracked_companies', 'export_metrics', 'ai_brief'],
        trackedItemTypes: ['company', 'lead', 'deal'],
        aiPromptContext: 'Global IT outsourcing industry, BPO trends, competitive landscape for Uzbekistan as outsourcing destination'
    },
    'Global Marketing': {
        group: 'market_export',
        newsPresets: { keywords: ['IT Park Uzbekistan', 'Uzbekistan tech industry', 'Central Asia IT'], countries: ['us', 'gb'] },
        widgets: ['news_feed', 'media_mentions', 'tracked_companies', 'ai_brief'],
        trackedItemTypes: ['company', 'lead', 'event'],
        aiPromptContext: 'Global marketing of Uzbekistan IT industry, IT Park brand positioning, international tech events and PR opportunities'
    },

    // ── Investment & Startups ──
    'Venture Capital': {
        group: 'investment_startups',
        newsPresets: { keywords: ['venture capital Central Asia', 'tech investment Uzbekistan', 'startup funding seed round'], countries: ['us', 'gb', 'kz'] },
        widgets: ['news_feed', 'deal_pipeline', 'startup_tracker', 'investment_metrics', 'ai_brief'],
        trackedItemTypes: ['deal', 'startup', 'investor'],
        aiPromptContext: 'Venture capital, startup investment, tech funding in Central Asia and Uzbekistan, emerging market VC activity'
    },
    'PPP Investors': {
        group: 'investment_startups',
        newsPresets: { keywords: ['public private partnership technology', 'PPP infrastructure investment', 'government tech investment'], countries: ['us', 'gb', 'kz'] },
        widgets: ['news_feed', 'deal_pipeline', 'investment_metrics', 'project_tracker', 'ai_brief'],
        trackedItemTypes: ['deal', 'project', 'investor'],
        aiPromptContext: 'Public-private partnerships in technology, infrastructure investment, government technology programs'
    },
    'Startup Ecosystem': {
        group: 'investment_startups',
        newsPresets: { keywords: ['startup ecosystem Uzbekistan', 'tech incubator accelerator', 'startup support Central Asia'], countries: ['us', 'kz', 'uz'] },
        widgets: ['news_feed', 'startup_tracker', 'investment_metrics', 'event_planner', 'ai_brief'],
        trackedItemTypes: ['startup', 'event', 'project'],
        aiPromptContext: 'Startup ecosystem development, incubators, accelerators, startup support programs in Uzbekistan and Central Asia'
    },

    // ── Monitoring & Relations ──
    'BPO Monitoring': {
        group: 'monitoring_relations',
        newsPresets: { keywords: ['BPO industry trends', 'business process outsourcing tech', 'call center IT services'], countries: ['in', 'us'] },
        widgets: ['news_feed', 'resident_kpis', 'tracked_companies', 'ai_brief'],
        trackedItemTypes: ['company', 'metric'],
        aiPromptContext: 'BPO industry monitoring, business process outsourcing trends, IT Park BPO resident performance'
    },
    'Residents Relations': {
        group: 'monitoring_relations',
        newsPresets: { keywords: ['IT Park residents', 'tech company growth Uzbekistan', 'IT company management'], countries: ['uz', 'kz'] },
        widgets: ['news_feed', 'resident_kpis', 'tracked_companies', 'ai_brief'],
        trackedItemTypes: ['company', 'issue'],
        aiPromptContext: 'IT Park resident company relations, resident satisfaction, company growth metrics and support needs'
    },
    'Residents Registration': {
        group: 'monitoring_relations',
        newsPresets: { keywords: ['IT company registration Uzbekistan', 'IT Park resident benefits', 'tech company incorporation'], countries: ['uz'] },
        widgets: ['news_feed', 'registration_pipeline', 'resident_kpis', 'ai_brief'],
        trackedItemTypes: ['registration', 'company'],
        aiPromptContext: 'IT Park resident registration process, new company applications, registration pipeline and approval workflow'
    },
    'Residents Monitoring': {
        group: 'monitoring_relations',
        newsPresets: { keywords: ['IT company KPI monitoring', 'tech company compliance', 'IT Park resident performance'], countries: ['uz'] },
        widgets: ['news_feed', 'resident_kpis', 'tracked_companies', 'ai_brief'],
        trackedItemTypes: ['company', 'metric'],
        aiPromptContext: 'IT Park resident monitoring, company KPIs, compliance tracking, export and employment metrics per resident'
    },

    // ── Tech & AI ──
    'GovTech': {
        group: 'tech_ai',
        newsPresets: { keywords: ['govtech digital government', 'e-government services', 'public sector technology'], countries: ['us', 'gb', 'uz'] },
        widgets: ['news_feed', 'tech_trends', 'project_tracker', 'regulatory_tracker', 'ai_brief'],
        trackedItemTypes: ['project', 'company'],
        aiPromptContext: 'Government technology, digital public services, e-government initiatives, GovTech solutions'
    },
    'AI Infrastructure': {
        group: 'tech_ai',
        newsPresets: { keywords: ['AI infrastructure cloud computing', 'data center GPU', 'AI platform deployment'], countries: ['us', 'gb'] },
        widgets: ['news_feed', 'tech_trends', 'project_tracker', 'ai_brief'],
        trackedItemTypes: ['project', 'company'],
        aiPromptContext: 'AI infrastructure, cloud computing, GPU clusters, data centers, AI platform development and deployment'
    },
    'AI Research': {
        group: 'tech_ai',
        newsPresets: { keywords: ['artificial intelligence research', 'machine learning breakthroughs', 'AI paper latest'], countries: ['us', 'gb'] },
        widgets: ['news_feed', 'tech_trends', 'project_tracker', 'ai_brief'],
        trackedItemTypes: ['project', 'company'],
        aiPromptContext: 'AI research, machine learning advances, large language models, computer vision, NLP breakthroughs'
    },
    'Infrastructure': {
        group: 'tech_ai',
        newsPresets: { keywords: ['IT infrastructure Uzbekistan', 'data center Central Asia', 'telecom broadband'], countries: ['uz', 'kz'] },
        widgets: ['news_feed', 'project_tracker', 'resident_kpis', 'ai_brief'],
        trackedItemTypes: ['project', 'metric'],
        aiPromptContext: 'IT infrastructure development in Uzbekistan, data centers, broadband connectivity, technology parks'
    },
    'Infrastructure Dev': {
        group: 'tech_ai',
        newsPresets: { keywords: ['software infrastructure development', 'devops platform engineering', 'cloud native Uzbekistan'], countries: ['us', 'uz'] },
        widgets: ['news_feed', 'tech_trends', 'project_tracker', 'ai_brief'],
        trackedItemTypes: ['project', 'company'],
        aiPromptContext: 'Software infrastructure development, DevOps, platform engineering, cloud-native solutions'
    },

    // ── Marketing & PR ──
    'Marketing': {
        group: 'marketing_pr',
        newsPresets: { keywords: ['IT Park Uzbekistan marketing', 'tech brand marketing', 'digital marketing IT'], countries: ['uz', 'us'] },
        widgets: ['news_feed', 'media_mentions', 'event_planner', 'ai_brief'],
        trackedItemTypes: ['event', 'company', 'lead'],
        aiPromptContext: 'IT Park marketing activities, domestic tech branding, marketing campaigns, user acquisition'
    },
    'Multimedia': {
        group: 'marketing_pr',
        newsPresets: { keywords: ['tech content creation', 'multimedia production IT', 'video marketing technology'], countries: ['us'] },
        widgets: ['news_feed', 'project_tracker', 'media_mentions', 'ai_brief'],
        trackedItemTypes: ['project', 'event'],
        aiPromptContext: 'Multimedia content production, video and design for tech industry, content strategy'
    },
    'Public Relations': {
        group: 'marketing_pr',
        newsPresets: { keywords: ['IT Park Uzbekistan news', 'Uzbekistan tech PR', 'Central Asia tech coverage'], countries: ['us', 'gb', 'uz'] },
        widgets: ['news_feed', 'media_mentions', 'tracked_companies', 'ai_brief'],
        trackedItemTypes: ['company', 'event'],
        aiPromptContext: 'IT Park public relations, media coverage, press mentions, reputation management, journalist outreach'
    },
    'Event Management': {
        group: 'marketing_pr',
        newsPresets: { keywords: ['tech conference 2026', 'IT event Central Asia', 'hackathon tech summit'], countries: ['us', 'uz', 'kz'] },
        widgets: ['news_feed', 'event_planner', 'project_tracker', 'ai_brief'],
        trackedItemTypes: ['event', 'project'],
        aiPromptContext: 'Tech events, conferences, hackathons, summits, event planning and logistics for IT industry'
    },

    // ── Policy & Legal ──
    'Legal Ecosystem': {
        group: 'policy_legal',
        newsPresets: { keywords: ['IT law regulation Uzbekistan', 'tech policy digital regulation', 'data protection law'], countries: ['uz', 'gb', 'us'] },
        widgets: ['news_feed', 'regulatory_tracker', 'project_tracker', 'ai_brief'],
        trackedItemTypes: ['project', 'company'],
        aiPromptContext: 'IT legal ecosystem, tech regulation, data protection, intellectual property, digital commerce law'
    },
    'Softlanding': {
        group: 'policy_legal',
        newsPresets: { keywords: ['Uzbekistan Kazakhstan IT startup venture capital AI', 'IT visa tax exemption tech workers Central Asia', 'IT Park Uzbekistan Astana Hub startup ecosystem', 'AI IoT startup funding Central Asia investment', 'IT legislation regulation digital economy Uzbekistan Kazakhstan', 'tech company relocation coworking Tashkent Astana'], countries: ['uz', 'kz', 'us', 'gb', 'ae'] },
        widgets: ['call_log', 'call_script', 'office_directory', 'lead_pipeline', 'spravochnik', 'news_feed', 'ai_brief'],
        trackedItemTypes: ['lead', 'company', 'registration'],
        aiPromptContext: 'IT industry soft landing programs, startup and venture capital ecosystem in Uzbekistan and Kazakhstan, AI and IoT developments, IT visa and tax exemptions for tech companies, IT legislation and digital economy regulations, tech company relocation, coworking spaces, IT Park residency benefits'
    },
    'Analytics': {
        group: 'policy_legal',
        newsPresets: { keywords: ['IT industry analytics', 'tech market data', 'IT sector statistics Central Asia'], countries: ['us', 'uz', 'kz'] },
        widgets: ['news_feed', 'country_comparison', 'export_metrics', 'resident_kpis', 'ai_brief'],
        trackedItemTypes: ['metric', 'company'],
        aiPromptContext: 'IT industry analytics, market data, sector statistics, benchmarking IT Park against global tech hubs'
    },

    // ── Social & Regional ──
    'Freelancers & Youth': {
        group: 'social_regional',
        newsPresets: { keywords: ['freelance IT Uzbekistan', 'youth tech education', 'remote work developer'], countries: ['uz', 'us'] },
        widgets: ['news_feed', 'community_metrics', 'project_tracker', 'event_planner', 'ai_brief'],
        trackedItemTypes: ['project', 'event'],
        aiPromptContext: 'Freelancer support programs, youth tech education, coding bootcamps, remote work opportunities in Uzbekistan'
    },
    'Regional Development': {
        group: 'social_regional',
        newsPresets: { keywords: ['regional IT development Uzbekistan', 'tech hub regions', 'IT Park branches'], countries: ['uz'] },
        widgets: ['news_feed', 'community_metrics', 'project_tracker', 'ai_brief'],
        trackedItemTypes: ['project', 'metric'],
        aiPromptContext: 'Regional IT development in Uzbekistan, IT Park branches, regional tech ecosystem, digital inclusion'
    },
    'Inclusive Projects': {
        group: 'social_regional',
        newsPresets: { keywords: ['inclusive tech programs', 'women in tech Central Asia', 'diversity IT industry'], countries: ['uz', 'us'] },
        widgets: ['news_feed', 'community_metrics', 'project_tracker', 'event_planner', 'ai_brief'],
        trackedItemTypes: ['project', 'event'],
        aiPromptContext: 'Inclusive technology projects, women in tech, diversity programs, accessibility in IT industry'
    }
};

function getDepartmentConfig(department) {
    return DEPARTMENT_CONFIG[department] || DEPARTMENT_CONFIG['Analytics'];
}

function getDepartmentGroup(department) {
    for (const [groupId, group] of Object.entries(DEPARTMENT_GROUPS)) {
        if (group.departments.includes(department)) return { id: groupId, ...group };
    }
    return { id: 'policy_legal', ...DEPARTMENT_GROUPS.policy_legal };
}

module.exports = { DEPARTMENT_GROUPS, DEPARTMENT_CONFIG, WIDGET_REGISTRY, getDepartmentConfig, getDepartmentGroup };
