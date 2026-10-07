import { Link, useLocation } from 'react-router-dom'
import { Activity, ArrowLeft } from 'lucide-react'

const content = {
  '/privacy': ['Privacy notice', 'How HMS ERP handles information submitted through this website.', [['Information you share', 'When you request a demo, we collect the details you provide, such as your name, organization, work email, facility type, and any optional notes.'], ['How we use it', 'We use this information only to respond to your demo request and discuss HMS ERP. We do not sell demo-request information.'], ['Contact', 'For questions about a request, use the product walkthrough form and include “Privacy” in your note.']]],
  '/terms': ['Website terms', 'The terms that apply to your use of the HMS ERP website.', [['Information on this site', 'This website describes HMS ERP at a high level. Product availability, configuration, implementation, service levels, and commercial terms are confirmed separately in writing.'], ['Demonstration content', 'Screens, workflows, data, testimonials, and metrics marked as demo or illustrative are examples for presentation purposes and are not customer records or performance guarantees.'], ['No clinical advice', 'HMS ERP is operational software. This website does not provide medical or clinical advice.']]],
  '/security': ['Security approach', 'A concise overview of the controls represented in HMS ERP.', [['Access control', 'HMS ERP includes role-based access patterns so facility teams can work in the modules relevant to their responsibilities.'], ['Authentication & activity', 'The product uses authenticated access and records meaningful activity through audit-log functionality where configured.'], ['Implementation review', 'Security, data handling, deployment configuration, and operational responsibilities should be reviewed with every facility before production use. No certification or regulatory-compliance claim is made on this page.']]],
}

export default function LegalPage() {
  const { pathname } = useLocation(); const [title, lead, blocks] = content[pathname] || content['/privacy']
  return <main className="legal-page"><header><Link to="/"><Activity size={19}/> HMS ERP</Link><Link className="legal-back" to="/"><ArrowLeft size={15}/> Back to home</Link></header><article><p>HMS ERP · WEBSITE</p><h1>{title}</h1><h2>{lead}</h2>{blocks.map(([heading, body]) => <section key={heading}><h3>{heading}</h3><p>{body}</p></section>)}<small>Last updated: October 6, 2026</small></article></main>
}
