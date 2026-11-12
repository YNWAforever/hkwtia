// Executive Committee roster for /about/committees.
//
// Source of record: docs/exco-update-20261113/<slug>.md (verbatim Drive bios).
// Paragraphs keep each member's wording, including original typos. The only
// normalisation is whitespace: a line break that splits a sentence is joined,
// and a trailing profile URL in larry-lam.md is left out of the page.
//
// Order is provisional: Willy Lai first as Chairman, then the other members
// by surname (Chan, Chau, Cheung, Ha, Kun, Lam, Ma, Mak, Poon, Tse, Yung).
// It is not a confirmed precedence list.
//
// zhPending: no Traditional Chinese bio was supplied. zh-HK renders `paragraphs`
// in English. Do not machine-translate. Chinese names exist only where the
// brief or the member's own text gives one: 賴志偉 (Willy) and 夏羽 (Simon).
// Willy's Chinese title is 主席. Never 會長.
//
// Photos live at public/images/exco/<slug>.jpg. lawrence-cheung uses
// lawrence-cheung.jpg (not lawrence-cheung-alt.jpg). Alex has no photo.

export type ExcoRosterMember = Readonly<{
  slug: string;
  name: string;
  surname: string;
  /** zh-HK heading. Absent unless a Chinese name was supplied. */
  zhName?: string;
  /** English title line. Null when the source has no title line. */
  title: string | null;
  /** zh-HK title line. Only Willy's 主席 was supplied. */
  zhTitle?: string;
  /** Separate organisation line from the source header. Null when there is none. */
  organization: string | null;
  paragraphs: readonly string[];
  /** Null renders an initials placeholder. No stock image and no logo. */
  photo: string | null;
  /** `top` keeps full-body and landscape frames from cropping the face. */
  photoPosition: "center" | "top";
  /**
   * Traditional Chinese bio was not supplied. zh-HK renders `paragraphs` in English.
   * Do not machine-translate.
   */
  zhPending: true;
}>;

export const excoRoster: readonly ExcoRosterMember[] = [
  {
    slug: "willy-lai",
    name: "Willy Lai",
    surname: "Lai",
    zhName: "賴志偉",
    title: "Chairman of WTIA",
    zhTitle: "主席",
    organization: null,
    paragraphs: [
      "Willy Lai is the Co-Founder and CEO of FIMMICK and Chairman of WTIA. With a background in information technology and digital marketing, he works at the intersection of business strategy, data and emerging technologies.",
      "At FIMMICK, Willy leads the company’s development in AI-driven business transformation, helping organisations apply generative AI, marketing technology and automation to practical business challenges. His work focuses on connecting data, people and workflows to improve customer engagement, operational efficiency and business growth, with particular attention to the needs of SMEs.",
      "Willy is also active in Hong Kong’s innovation and entrepreneurship community. He has served as a guest lecturer in entrepreneurship at PolyU SPEED for over 10 years. He has also served as an assessor for the Hong Kong ICT Awards’ ICT Startup Award, including as Chief Assessor for Software and Apps, and mentors participants in the Cathay Hackathon. Through teaching, industry talks and hands-on training, he shares practical insights with business leaders, startup founders and emerging talent.",
      "As WTIA Chairman, Willy promotes cross-industry collaboration and the practical adoption of advanced technologies to strengthen business competitiveness and support Hong Kong’s innovation and technology ecosystem.",
    ],
    photo: "/images/exco/willy-lai.jpg",
    photoPosition: "center",
    zhPending: true,
  },
  {
    slug: "ricky-chan",
    name: "Ricky CHAN",
    surname: "Chan",
    title: "CEO and Co-Founder",
    organization: null,
    paragraphs: [
      "Ricky CHAN is the CEO and Co-Founder of i-gen.ai and Reform Marketing Solutions, a Hong Kong-based GEO, AI SEO and digital marketing firm with a branch in Zhuhai. i-gen.ai is supported by Cyberport’s Incubation Programme (CIP) and has participated in a Qianhai innovation programme.",
      "Ricky leads the development of AI-powered marketing solutions that help SMEs adopt practical technology, strengthen digital capabilities and achieve measurable business growth. He spearheaded i-gen.ai’s proprietary AI marketing platform, integrating market analysis, content creation and performance optimisation across websites, social media, email and digital advertising. The platform was recognised at the HKRMA Smart Retail Awards 2025. Ricky is committed to promoting responsible AI adoption, fostering cross-sector collaboration and contributing to Hong Kong’s innovation ecosystem.",
    ],
    photo: "/images/exco/ricky-chan.jpg",
    photoPosition: "top",
    zhPending: true,
  },
  {
    slug: "burton-chau",
    name: "Burton Chau",
    surname: "Chau",
    title: "General Manager, Sanuker Inc. Limited",
    organization: null,
    paragraphs: [
      "Burton Chau leads Sanuker in providing pioneering business messaging and AI chatbot solutions that help enterprises drive digital transformation in the conversational era. With his expertise and vision in the conversational business industry, he has guided the company’s expansion into the Greater China region, Singapore, Mexico, Spain and Southeast Asia, and the launch of WOZTELL, its conversational management platform, across Asia and Spanish-speaking markets. Many of Sanuker’s projects have been celebrated as success stories by Meta, and the company is a recognised partner of Meta, AWS and HSBC.",
      "Burton also initiated the Conversational Business Programme at the School of Engineering (ETSE) of the University of Valencia in Spain.",
    ],
    photo: "/images/exco/burton-chau.jpg",
    photoPosition: "center",
    zhPending: true,
  },
  {
    slug: "lawrence-cheung",
    name: "Lawrence Cheung",
    surname: "Cheung",
    title: "Chief Technology Officer",
    organization: null,
    paragraphs: [
      "Dr Lawrence Cheung has over 30 years of experience in managing research and development and consultancy business portfolio. In HKPC, he currently manages broad business functions on technology research and development as well as consultancy services in Robotics and Artificial Intelligence, FutureSkills training, SME and Startup support, as well as Corporate Development. He leads the development and implementation of the Technology Game Plan for HKPC in the areas of microelectronics, life and health, robotics and artificial intelligence, smart manufacturing and new energy. He assumed the position of Member of the Board, Hong Kong Industrial Artificial Intelligence & Robotics Centre (FLAIR) in 2019 and Chief Executive Officer of FLAIR in May 2025.",
      "He is respectively a Member of Assessment Committee of Green Tech Fund in the Environmental Protection Department; a Member of Steering Committee on Promotion of Vocational and Professional Education and Training (VPET) and Qualifications Framework (QF) in the Education Bureau, a Member of the Sub-group on Research Postgraduate Programmes for the Planning Exercise for the 2025-28 Triennium under the University Grants Committee, and, a Member of the Peer Review Expert Panel for of Research, Academic and Industry Sectors One-plus (RAISe+) Scheme.",
      "He is also an Honorary Advisor of the Hong Kong Electronics and Technologies Association; Vice Chairman of the Hong Kong Wireless Technology Industry Association; Member of the Executive Committee of the Hong Kong Electronic Industries Association; Member of Innovation & Technology Development Committee in Federation of Hong Kong Industries; and Member of Industry & Technology Committee in Hong Kong General Chamber of Commerce.",
      "Prior to joining HKPC, Dr Cheung was living in Australia holding a senior research position in Commonwealth Scientific and Industrial Research Organisation (CSIRO) of Australia. He obtained Bachelor of Engineering with first class honours and Bachelor of Science degrees from Monash University in Australia. His doctorate degree on Computer Imaging research was also from Monash University. Dr Cheung joined HKPC in 1996.",
    ],
    photo: "/images/exco/lawrence-cheung.jpg",
    photoPosition: "center",
    zhPending: true,
  },
  {
    slug: "simon-ha",
    name: "Simon Ha",
    surname: "Ha",
    zhName: "夏羽",
    title: "Head of Business Development and Marketing",
    organization: null,
    paragraphs: [
      "Simon Ha (夏羽) is Head of Business Development and Marketing at FUJIFILM Business Innovation Hong Kong, where he leads strategic business development and marketing initiatives to drive growth, market expansion and customer engagement.",
      "With over 20 years of experience in the technology industry, Simon has extensive expertise in commercializing and promoting innovative solutions across AI, cloud computing, cybersecurity, data analytics and digital transformation. His career spans business development, product marketing and regional software and solutions businesses across Hong Kong and Asia.",
      "Simon also serves as Vice Chairman of the Marketing & Media Committee of HKiNEDA, contributing to professional development and good corporate governance. He holds both MBA and a Bachelor of Arts degree from HKU.",
      "As an Executive Committee Member of WTIA, Simon looks forward to contributing his industry experience and business network to foster technology adoption, industry collaboration and innovation in Hong Kong.",
    ],
    photo: "/images/exco/simon-ha.jpg",
    photoPosition: "center",
    zhPending: true,
  },
  {
    slug: "alex-kun",
    name: "Alex Kun",
    surname: "Kun",
    title: "Principle Lead – Business Development & Innovation",
    organization: "Hutchison Telecommunications (Hong Kong) Limited",
    paragraphs: [
      "With over three decades of experience across the digital landscape, Alex has built a distinguished career spanning media, internet services, IT, fintech, and telecommunications. His cross-functional expertise encompasses hardware and accessory commercialization, product and business development, strategic marketing, enterprise technology solutions, and high-impact partnerships. An entrepreneurial leader with an execution-focused approach, Alex leverages deep insights into emerging technologies and shifting consumer behaviors to rapidly launch products tailored to local market demands. He has a proven track record of scaling innovative concepts from initial ideation into profitable, high-growth ventures, including Next Media Interactive, Tap & Go, and Birdie Mobile etc.",
    ],
    photo: null,
    photoPosition: "center",
    zhPending: true,
  },
  {
    slug: "larry-lam",
    name: "Larry Lam",
    surname: "Lam",
    title: null,
    organization: null,
    paragraphs: [
      "Larry Lam is the co-founder of KaChick and Gump, building travel photography and AI photo management platforms across Asia.",
      "KaChick connects travellers with local photographers through a network of approximately 5,000 photographers.",
      "Gump is a leading AI photo management platform that has supported more than 1,000 events, including JUMPSTARTER, the HKUST Congregation, the Hong Kong ICT Awards, the Asia Economic Forum and Tech Week Singapore.",
      "Gump is listed in Hong Kong’s Smart Government Innovation Lab AI Solution Catalogue.",
      "Across both businesses, Larry combines commercial strategy with a belief that photography can inspire discovery, preserve memories and bring people closer together.",
      "Before founding KaChick and Gump, Larry worked at Morgan Stanley, PwC and Deutsche Bank. He is a Certified Public Accountant and holds a Juris Doctor. He believes technology should strengthen human connection—not replace it.",
    ],
    photo: "/images/exco/larry-lam.jpg",
    photoPosition: "center",
    zhPending: true,
  },
  {
    slug: "antony-ma",
    name: "Antony Ma",
    surname: "Ma",
    title: "CEO, Hoplite Technology Limited",
    organization: null,
    paragraphs: [
      "Antony Ma is a cybersecurity professional with more than 20 years of experience spanning information security, IT auditing, and software development. He is the Founder and CEO of Hoplite Technology Ltd, which develops cybersecurity defence tools using cloud computing, and artificial intelligence. He holds CISSP and CCSP certifications and a Master of Laws (LLM) in Intellectual Property and Information Technology Law.",
      "Antony is committed to strengthening cloud security and helping businesses adopt effective security practices. He contributes to industry associations and standards initiatives, including the Hong Kong Wireless Technology Industry Association, ISO/IEC JTC 1/SC 27, and the Cloud Security Alliance.",
    ],
    photo: "/images/exco/antony-ma.jpg",
    photoPosition: "top",
    zhPending: true,
  },
  {
    slug: "jess-mak",
    name: "Jess Mak",
    surname: "Mak",
    title: "Senior Vice President of Enterprise Market",
    organization: "Hutchison Telecommunications (Hong Kong) Limited",
    paragraphs: [
      "Miss Jess Mak has been Senior Vice President of Enterprise Market of Hutchison Telecommunications (Hong Kong) Limited since 2021, overseeing the development of 3 Hong Kong in the enterprise market. She plays a crucial role in strategic planning and is visionary in bringing leading-edge corporate solutions to enterprises. Jess has over 26 years of experience in the telecoms industry and the Information and Communication Technology (ICT) sector. She is devoted to promoting the deployment of innovative 5G solutions namely virtual reality, artificial intelligence and NB-IoT in business operations, helping corporate customers of all sizes to raise efficiency and productivity.",
    ],
    photo: "/images/exco/jess-mak.jpg",
    photoPosition: "center",
    zhPending: true,
  },
  {
    slug: "lawrence-poon",
    name: "Lawrence Poon",
    surname: "Poon",
    title: null,
    organization: null,
    paragraphs: [
      "Ir Prof. Lawrence Poon is a seasoned innovation and technology leader with over 20 years of experience in building new ventures from the ground up in Hong Kong's public innovation ecosystem. He spent 18 years at the Hong Kong Productivity Council (HKPC), where he built and led the Smart City Division, growing a team of 140 professionals and driving digital transformation for industry and government. He was subsequently invited by ASTRI CEO Denis Yip to join ASTRI as CEO Advisor and Head of Innovative Technology. There, he established a new technology division from scratch, building a team of 25+ professionals and securing over HK$80 million in project pipeline within nine months. He is recognised for bridging government, industry, academia and startups to translate emerging technologies — including AI, IoT and smart city solutions — into commercial and societal impact.",
    ],
    photo: "/images/exco/lawrence-poon.jpg",
    photoPosition: "center",
    zhPending: true,
  },
  {
    slug: "nelson-tse",
    name: "Nelson Tse",
    surname: "Tse",
    title: "Founder & CEO",
    organization: "Million Tech Development Limited",
    paragraphs: [
      "Mr. Nelson Tse is the Founder & CEO of Million Tech Development Limited. Drawing on over 38 years of dedicated leadership in Hong Kong’s IT and IoT sectors, he has guided the company since its establishment in 1987 to become a premier provider of smart technology services and automated solutions.",
      "Under his strategic vision, Million Tech focuses on empowering organizations and elevating operational efficiency through practical, high-impact innovation. The company delivers end-to-end expertise across six core domains: Smart Health, Smart Education, IoT, Vending & Kiosk Systems, Enterprise Solutions, and Robotics Labelling Solutions. Driven by a commitment to quality and technology integration, Nelson continues to lead Million Tech in shaping intelligent automation and digital transformation for commercial, institutional, and public sector clients throughout Hong Kong.",
      "Members:",
      "▪ Honorary Chairman of Hong Kong Retail Technology Industry Association (HKRTIA)",
      "▪ Treasurer & Executive Committee Member of Hong Kong Wireless Technology Industry Association (WTIA)",
    ],
    photo: "/images/exco/nelson-tse.jpg",
    photoPosition: "center",
    zhPending: true,
  },
  {
    slug: "eric-yung",
    name: "Eric Yung",
    surname: "Yung",
    title: "Playnote / Founder and CEO",
    organization: null,
    paragraphs: [
      "Eric Yung is a serial entrepreneur with extensive experience in technology innovation, business development and corporate management. He has founded and co-founded multiple companies and business groups operating internationally across technology, education, travel and cross-border business consultancy.",
      "He is the Founder and CEO of Playnote, an AI-driven EdTech company specialising in AI-powered music education and other AI-related music products. With authorisation from the Associated Board of the Royal Schools of Music (ABRSM), Playnote has developed AI solutions capable of analysing students' musical performances against examination requirements, providing automated assessments and personalised feedback.",
      "With extensive experience in establishing and scaling businesses across international markets, Eric brings entrepreneurial, technological, commercial and legal perspectives to his role as Legal Advisor to WTIA.",
      "Eric holds a BEng, MPhil in Electronic Engineering and MBA from HKUST, as well as a Bachelor of Laws (LLB) from the University of London.",
    ],
    photo: "/images/exco/eric-yung.jpg",
    photoPosition: "center",
    zhPending: true,
  },
];
