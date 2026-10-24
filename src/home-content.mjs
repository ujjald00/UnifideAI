import { categoryContent } from './category-content.mjs';

export const primaryNavigation = [
  ['solutions', 'solutions', 'Solutions'],
  ['platform', 'product', 'Platform'],
  ['technology', 'capabilities', 'Technology'],
  ['industries', 'industries', 'Industries'],
  ['resources', 'resources', 'Resources'],
  ['company', 'company', 'Company'],
].map(([id, pageId, label]) => ({ id, pageId, label, href: `/#${id}`, pageHref: `/${pageId}/` }));

export const founders = [
  { name: 'Ujjal Dutta', linkedin: 'https://www.linkedin.com/in/ujjaldutta/' },
  { name: 'Saurabh Amin', linkedin: 'https://www.linkedin.com/in/saurabh-amin-361463239/' },
  { name: 'Mathieu Dahan', linkedin: 'https://www.linkedin.com/in/mathieudahan/' },
];

// Short homepage summaries have distinct jobs from the detailed category copy.
// Resolve their destinations against the existing content so bookmarks cannot drift.
const item = (pageId, sectionId, title, text) => {
  if (!categoryContent[pageId]?.sections.some(section => section.id === sectionId)) throw new Error(`Missing homepage destination: ${pageId}/${sectionId}`);
  return { title, text, href: `/${pageId}/#${sectionId}` };
};

export const homeContent = {
  solutions: {
    intro: 'Adapt AI to specialist work, run it efficiently, and make better business choices.',
    link: 'Explore solutions',
    items: [
      item('solutions', 'industry-ai-models', 'Industry-ready AI', 'Adapt models to the language, tasks, and standards of your industry.'),
      item('solutions', 'efficient-ai-deployment', 'Efficient AI deployment', 'Run AI within your speed, compute, and cost needs.'),
      item('solutions', 'enterprise-decision-optimization', 'Better enterprise decisions', 'Compare feasible options and understand what each choice gains and gives up.'),
    ],
  },
  platform: {
    intro: 'A proposed workspace for moving from business evidence to options that people can review.',
    link: 'Explore the platform',
    items: [
      item('product', 'inputs-and-outputs', 'Evidence', 'Bring relevant records, business rules, and constraints together.'),
      item('product', 'workflow', 'Options', 'Compare possible decisions with their assumptions and trade-offs.'),
      item('product', 'human-control', 'Human review', 'Review the proposed action and keep a clear decision record.'),
    ],
  },
  technology: {
    intro: 'Three methods connect industry knowledge, efficient AI, and practical decision-making.',
    link: 'Explore technology',
    items: [
      item('capabilities', 'model-post-training-and-evaluation', 'Post-training and evaluation', 'Adapt an existing model to a defined task. Check its answers against agreed standards.'),
      item('capabilities', 'model-compression-and-efficient-inference', 'Compression and efficient inference', 'Reduce model size and compute needs while testing quality and response time.'),
      item('capabilities', 'decision-optimization', 'Decision optimization', 'Represent goals and limits in a model to compare feasible choices.'),
    ],
  },
  industries: {
    intro: 'Semiconductors first. Data centres and energy infrastructure are exploratory areas.',
    link: 'Explore industries',
    items: [
      item('industries', 'semiconductor-and-advanced-manufacturing', 'Semiconductor', 'Connect demand, parts, factory capacity, and quality to explore what could be delivered.'),
      item('industries', 'data-centres', 'Data centres', 'Plan capacity around power, equipment, and site readiness.'),
      item('industries', 'energy-and-grid-infrastructure', 'Energy and grid infrastructure', 'Choose project priorities when grid access, equipment, or delivery capacity is limited.'),
    ],
  },
  resources: {
    intro: 'Explore research and case studies on planning, manufacturing, and industry decisions.',
    link: 'Explore resources',
    summaries: {
      'optimization-methods': 'Compare purchasing, production, inventory, and shipments under supply limits.',
      'manufacturing-decisions': 'Connect business data, industry AI, and planning across the value chain.',
      'wbg-policy-research': 'Examine the barriers between semiconductor research and industrial use.',
    },
  },
  company: {
    intro: 'UNIFIDE is developing tools for better enterprise decisions, starting with semiconductors.',
    link: 'About UNIFIDE',
  },
};
