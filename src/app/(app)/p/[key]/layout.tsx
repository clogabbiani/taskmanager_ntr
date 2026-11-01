/** Project layout: `modal` renders the issue side panel over the current view (intercepted route). */
export default function ProjectLayout({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
