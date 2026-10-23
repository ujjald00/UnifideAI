export const categoryContent = {
  solutions: {
    title: 'Solutions',
    lede: 'Make AI useful for specialist work, run it within practical limits, and compare complex business choices.',
    sections: [
      {
        id: 'industry-ai-models',
        title: 'Industry AI models',
        text: 'Specialist work needs models that understand the terms, tasks, and standards of the business. Start with a defined task and agree how useful answers will be judged.',
      },
      {
        id: 'efficient-ai-deployment',
        title: 'Efficient AI deployment',
        text: 'AI must fit the available budget, computing capacity, and response time. Choose the level of model quality the task requires, then assess ways to run it within those limits.',
      },
      {
        id: 'enterprise-decision-optimization',
        title: 'Enterprise decision optimization',
        text: 'Business choices often compete for the same money, materials, or capacity. Compare options against these limits and make the trade-offs clear for the people responsible for the decision.',
      },
    ],
  },
  product: {
    title: 'Platform',
    lede: 'A proposed workspace for moving from business evidence to options that people can review.',
    sections: [
      {
        id: 'workflow',
        title: 'From evidence to review',
        text: 'Begin with a business question and the evidence relevant to it. The proposed workflow would connect that evidence to possible options, then bring those options to a person for review.',
      },
      {
        id: 'inputs-and-outputs',
        title: 'What goes in and comes out',
        text: 'Work would begin with selected records, business rules, and the limits a decision must respect. The intended output is a set of options with their assumptions and trade-offs made clear.',
      },
      {
        id: 'human-control',
        title: 'People stay in control',
        text: 'People would check the evidence, question the assumptions, and decide whether an option is suitable. Approval of an option would remain separate from permission to change a business system.',
      },
    ],
  },
  capabilities: {
    title: 'Technology',
    lede: 'Three methods support the approach: adapt models to a task, reduce the resources they need, and calculate feasible choices.',
    sections: [
      {
        id: 'model-post-training-and-evaluation',
        title: 'Model post-training and evaluation',
        text: 'Post-training adapts an existing model to a defined task using relevant examples. Evaluation checks its answers against agreed standards and records where it still falls short.',
      },
      {
        id: 'model-compression-and-efficient-inference',
        title: 'Model compression and efficient inference',
        text: 'Compression reduces a model’s size, while inference methods change how it runs. Test any change against the required answer quality, response time, memory use, and cost.',
      },
      {
        id: 'decision-optimization',
        title: 'Decision optimization',
        text: 'Optimization represents business goals and limits in a mathematical model. It compares feasible choices under stated assumptions, so people can see what each option gains and gives up.',
      },
    ],
  },
  industries: {
    title: 'Industries',
    lede: 'Semiconductors are our first focus. Data centres and energy infrastructure are exploratory areas where similar planning problems may arise.',
    sections: [
      {
        id: 'semiconductor-and-advanced-manufacturing',
        title: 'Semiconductor',
        text: 'Planning must connect customer demand with parts, factory capacity, and quality requirements. Our focus is helping teams explore what they could deliver when these limits or the evidence change.',
      },
      {
        id: 'data-centres',
        title: 'Data centres',
        text: 'This is an exploratory focus on capacity planning around power, equipment, and site readiness. The starting question is which capacity could be delivered, when, and with what trade-offs.',
      },
      {
        id: 'energy-and-grid-infrastructure',
        title: 'Energy and grid infrastructure',
        text: 'This is an exploratory focus on choosing project priorities when grid access, equipment, or delivery capacity is limited. The starting question is which projects could move forward under those conditions.',
      },
    ],
  },
  security: {
    title: 'Security and Trust',
    lede: 'Proposed principles for keeping data access and business actions under human control.',
    sections: [
      {
        id: 'data-and-access-controls',
        title: 'Data and access controls',
        text: 'Define which data each role may use and how long it may be kept. Access rules should be checked before information reaches a model, with responsibility assigned to a data owner.',
      },
      {
        id: 'deployment-options',
        title: 'Deployment options',
        text: 'Assess cloud, on-premises, or hybrid deployment against the project’s data, performance, and support needs. The environment and its controls would need to be agreed and verified before operational use.',
      },
      {
        id: 'human-approval-and-controlled-writeback',
        title: 'Approval before action',
        text: 'Require a named decision owner to approve a specific change before it reaches a business system. A recommendation alone should grant no permission to act or change an operating record.',
      },
    ],
  },
};
