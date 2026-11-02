import "./globals.css";
export const metadata={title:"Campus Connect",description:"Find your people. Make something happen."};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body><header><strong>Campus Connect<span style={{color:'#6f8d73'}}> ↗</span></strong><a href="/signin-with-chatgpt?return_to=/" target="_top">Sign in with ChatGPT</a></header>{children}</body></html>}
