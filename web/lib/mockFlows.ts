export type AgentId = 'router' | 'billing' | 'tech' | 'order' | 'returns' | 'knowledge' | 'human';
export type AgentStatus = 'idle' | 'active' | 'complete' | 'error';

export interface AgentDef {
  name: string;
  icon: string;
  color: string;
  desc: string;
}

export interface ToolTrace {
  fn: string;
  result: string;
  ms: number;
}

export interface PipelineStepDef {
  label: string;
  detail: string;
}

export interface Flow {
  aid: AgentId;
  steps: PipelineStepDef[];
  rTrace: ToolTrace[];
  aTrace: ToolTrace[];
  reply: string;
}

export const AGENT_DEFS: Record<AgentId, AgentDef> = {
  router:    { name: 'Router Agent',     icon: 'RT', color: '#0ea5e9', desc: 'Orchestrates & delegates requests' },
  billing:   { name: 'Billing Agent',    icon: '$',  color: '#f59e0b', desc: 'Account & invoice queries' },
  tech:      { name: 'Tech Support',     icon: 'TS', color: '#6366f1', desc: 'Diagnostics & troubleshooting' },
  order:     { name: 'Order Status',     icon: 'OS', color: '#06d6a0', desc: 'Shipment & delivery tracking' },
  returns:   { name: 'Returns Agent',    icon: 'RR', color: '#f97316', desc: 'Refunds & exchanges' },
  knowledge: { name: 'Knowledge Base',   icon: 'KB', color: '#8b5cf6', desc: 'Documentation & FAQs' },
  human:     { name: 'Human Escalation', icon: 'HE', color: '#ef4444', desc: 'Live agent handoff' },
};

export const AGENT_ORDER: AgentId[] = ['router', 'billing', 'tech', 'order', 'returns', 'knowledge', 'human'];

const FLOWS: Array<{ kw: string[]; flow: Flow }> = [
  {
    kw: ['bill', 'billing', 'charge', 'invoice', 'payment', 'cost', 'fee', 'overcharged', 'credit', 'price'],
    flow: {
      aid: 'billing',
      steps: [
        { label: 'Input Received',      detail: 'Message tokenized · 94 tokens' },
        { label: 'Router Analysis',     detail: 'Intent: billing_inquiry · conf 0.94' },
        { label: 'Delegate → Billing',  detail: 'Context window transferred' },
        { label: 'Tool Execution',      detail: 'check_account_balance · get_invoice_history' },
        { label: 'Response Generation', detail: 'GPT-4o · 312ms first token' },
        { label: 'Delivered',           detail: '~4,200ms total · 231 tokens out' },
      ],
      rTrace: [
        { fn: 'analyze_intent(message, session_ctx)', result: '{"intent":"billing_inquiry","confidence":0.94,"entities":["billing"]}', ms: 340 },
      ],
      aTrace: [
        { fn: 'check_account_balance(account_id="ACC-84721")', result: '{"balance":"-$23.50","status":"credit","currency":"USD"}', ms: 892 },
        { fn: 'get_invoice_history(account_id, months=3)', result: '[{"month":"May","amount":"$89.99"},{"month":"Apr","amount":"$89.99"}]', ms: 645 },
        { fn: 'calculate_pending_credits()', result: '{"pending_credit":"$23.50","applied_next_cycle":true,"date":"2024-07-01"}', ms: 231 },
      ],
      reply: "I've reviewed your account and found a **$23.50 credit** — it looks like you were overcharged last month. This will automatically apply to your next billing cycle on July 1st.\n\nYour standard monthly rate is **$89.99**. Is there anything else I can clarify?",
    },
  },
  {
    kw: ['internet', 'wifi', 'connection', 'slow', 'disconnect', 'network', 'outage', 'speed', 'signal', 'dropping', 'router', 'modem'],
    flow: {
      aid: 'tech',
      steps: [
        { label: 'Input Received',           detail: 'Message tokenized · 78 tokens' },
        { label: 'Router Analysis',          detail: 'Intent: tech_support · conf 0.97' },
        { label: 'Delegate → Tech Support',  detail: 'Diagnostic tools activated' },
        { label: 'Tool Execution',           detail: 'run_network_diagnostics · check_router_status' },
        { label: 'Response Generation',      detail: 'GPT-4o · 287ms first token' },
        { label: 'Delivered',                detail: '~5,100ms total · 284 tokens out' },
      ],
      rTrace: [
        { fn: 'analyze_intent(message, session_ctx)', result: '{"intent":"tech_support","confidence":0.97,"subtopic":"connectivity"}', ms: 312 },
      ],
      aTrace: [
        { fn: 'run_network_diagnostics(account_id="ACC-84721")', result: '{"ping_ms":42,"packet_loss_pct":3.2,"status":"degraded","node":"CHI-04"}', ms: 1243 },
        { fn: 'check_router_status(account_id)', result: '{"model":"TG3482G","firmware":"v2.1.4","latest":"v2.2.1","uptime_hours":86}', ms: 876 },
        { fn: 'read_troubleshooting_guide(issue="packet_loss", model="TG3482G")', result: '{"kb_id":"KB-2947","steps":3,"severity":"medium"}', ms: 412 },
      ],
      reply: "I ran a remote diagnostic and found **3.2% packet loss** — that explains the drops. Your router firmware (**v2.1.4**) is also outdated; latest is v2.2.1.\n\nTry unplugging your modem for 30 seconds and reconnect. If the problem continues I can arrange a remote firmware update or book a technician visit — just say the word.",
    },
  },
  {
    kw: ['order', 'package', 'shipping', 'delivery', 'tracking', 'shipped', 'arrive', 'parcel', 'where is', 'dispatch'],
    flow: {
      aid: 'order',
      steps: [
        { label: 'Input Received',          detail: 'Message tokenized · 61 tokens' },
        { label: 'Router Analysis',         detail: 'Intent: order_status · conf 0.96' },
        { label: 'Delegate → Order Status', detail: 'Order lookup initialized' },
        { label: 'Tool Execution',          detail: 'lookup_order · get_shipping_status' },
        { label: 'Response Generation',     detail: 'GPT-4o · 301ms first token' },
        { label: 'Delivered',               detail: '~3,800ms total · 198 tokens out' },
      ],
      rTrace: [
        { fn: 'analyze_intent(message, session_ctx)', result: '{"intent":"order_status","confidence":0.96}', ms: 298 },
      ],
      aTrace: [
        { fn: 'lookup_order(account_id="ACC-84721", query="recent")', result: '{"order_id":"ORD-5521A","item":"WiFi 6 Mesh Router 3pk","total":"$149.99"}', ms: 733 },
        { fn: 'get_shipping_status(order_id="ORD-5521A")', result: '{"carrier":"FedEx","tracking":"772891023785","status":"Out for Delivery"}', ms: 567 },
        { fn: 'estimate_delivery_window(tracking_id)', result: '{"eta":"Today Jun 27","window":"6:00-8:00 PM","signature_required":false}', ms: 189 },
      ],
      reply: "Great news — your order **ORD-5521A** (WiFi 6 Mesh Router 3-pack) is **out for delivery today!**\n\nFedEx expects it between **6:00 – 8:00 PM**. No signature required, so it can be left at the door. Tracking number: `772891023785`",
    },
  },
  {
    kw: ['return', 'refund', 'cancel', 'exchange', 'defective', 'broken', 'send back', 'money back', 'wrong item'],
    flow: {
      aid: 'returns',
      steps: [
        { label: 'Input Received',            detail: 'Message tokenized · 72 tokens' },
        { label: 'Router Analysis',           detail: 'Intent: return_refund · conf 0.91' },
        { label: 'Delegate → Returns Agent',  detail: 'Return policy engine loaded' },
        { label: 'Tool Execution',            detail: 'check_eligibility · initiate_return_process' },
        { label: 'Response Generation',       detail: 'GPT-4o · 334ms first token' },
        { label: 'Delivered',                 detail: '~4,600ms total · 256 tokens out' },
      ],
      rTrace: [
        { fn: 'analyze_intent(message, session_ctx)', result: '{"intent":"return_refund","confidence":0.91,"urgency":"normal"}', ms: 367 },
      ],
      aTrace: [
        { fn: 'check_return_eligibility(account_id="ACC-84721")', result: '{"eligible":true,"days_since_purchase":12,"policy":"30_day_return"}', ms: 812 },
        { fn: 'initiate_return_process(account_id, item_id="ITEM-7723")', result: '{"return_id":"RET-9801","label_emailed":true,"drop_off_locations":47}', ms: 934 },
        { fn: 'calculate_refund(return_id="RET-9801")', result: '{"amount":"$149.99","method":"original_payment","processing_days":"5-7"}', ms: 278 },
      ],
      reply: "Your return is **approved!** Return ID: **RET-9801**\n\nYou're well within the 30-day window (purchase was 12 days ago). A prepaid FedEx label has been emailed to you.\n\n**Refund:** $149.99 → original payment method · 5–7 business days after we receive the item.",
    },
  },
];

const DEFAULT_FLOW: Flow = {
  aid: 'knowledge',
  steps: [
    { label: 'Input Received',            detail: 'Message tokenized · 56 tokens' },
    { label: 'Router Analysis',           detail: 'Intent: general_inquiry · conf 0.82' },
    { label: 'Delegate → Knowledge Base', detail: 'Semantic search initialized' },
    { label: 'Tool Execution',            detail: 'search_knowledge_base · get_articles' },
    { label: 'Response Generation',       detail: 'GPT-4o · 356ms first token' },
    { label: 'Delivered',                 detail: '~4,200ms total · 187 tokens out' },
  ],
  rTrace: [
    { fn: 'analyze_intent(message, session_ctx)', result: '{"intent":"general_inquiry","confidence":0.82}', ms: 421 },
  ],
  aTrace: [
    { fn: 'search_knowledge_base(query, embedding_model="ada-002")', result: '{"results":3,"top_score":0.87,"source":"cosmos_db"}', ms: 654 },
    { fn: 'get_relevant_articles(scores=[0.87,0.81])', result: '{"articles":["FAQ-102","FAQ-287"],"tokens":2847}', ms: 432 },
    { fn: 'summarize_content(articles, max_tokens=512)', result: '{"summary_tokens":156,"confidence":0.85,"cited":"FAQ-102"}', ms: 789 },
  ],
  reply: "I searched our help center and found some relevant resources.\n\nWould you like help with **billing**, **technical issues**, **order tracking**, or **returns**? I can route you to the right specialist right away — just describe what you need.",
};

export function getFlow(text: string): Flow {
  const lo = text.toLowerCase();
  for (const { kw, flow } of FLOWS) {
    if (kw.some((w) => lo.includes(w))) return flow;
  }
  return DEFAULT_FLOW;
}

export function hexToRgb(hex: string): string {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ].join(',');
}
