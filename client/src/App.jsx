import { MotionConfig } from 'framer-motion';
import { useDeck, useHashRoute } from './state/hooks.js';
import TabBar from './components/TabBar.jsx';
import HomePage from './components/HomePage.jsx';
import DiscoverPage from './components/discover/DiscoverPage.jsx';

export default function App() {
  const [route, navigate] = useHashRoute();
  const { newMatchIds } = useDeck();

  return (
    // reducedMotion="user": people who ask the OS for less motion get fades instead of
    // sliding/rotating/scaling animations. Dragging still works; it is the user's own movement.
    <MotionConfig reducedMotion="user">
      <div className="app-bg grain relative h-dvh w-full overflow-hidden text-white">
        {route.tab === 'home' ? <HomePage /> : <DiscoverPage view={route.view} onNavigate={navigate} />}
        <TabBar active={route.tab} badge={newMatchIds.length} onChange={(tab) => navigate(tab)} />
      </div>
    </MotionConfig>
  );
}
