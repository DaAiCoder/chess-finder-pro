import * as React from "react";
import { Switch, Route, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { OperatorAuthBoundary } from "@/components/admin/OperatorAuthBoundary";
import { Toaster } from "@/components/ui/Toaster";
import { isAdminHost } from "@/lib/adminHost";
import { RequireAuth } from "@/components/RequireAuth";
import { RequireTrainingPro } from "@/components/training/RequireTrainingPro";
import { ConsentBanner } from "@/components/ConsentBanner";
import { SupportChatWidget } from "@/components/support/SupportChatWidget";
import { bootstrapConsent, trackPageView, consumeSignedUpFromUrl } from "@/lib/analytics";
import { trackInternalPageView } from "@/lib/internalAnalytics";
import ChessTrainer from "@/pages/chess-trainer";
import Onboarding from "@/pages/onboarding";
import NotFound from "@/pages/not-found";

const Landing = React.lazy(() => import("@/pages/landing"));
const Home = React.lazy(() => import("@/pages/home"));

// Lazy-load the heavier pages to keep the initial bundle small.
const Play = React.lazy(() => import("@/pages/play"));
const ImportGames = React.lazy(() => import("@/pages/import-games"));
const GameAnalysis = React.lazy(() => import("@/pages/game-analysis"));
const AnalyticsDashboard = React.lazy(() => import("@/pages/analytics-dashboard"));
const OpponentPrep = React.lazy(() => import("@/pages/opponent-prep"));
const TrainingDashboard = React.lazy(() => import("@/pages/training-dashboard"));
const TacticsTrainer = React.lazy(() => import("@/pages/tactics-trainer"));
const BlunderPreventer = React.lazy(() => import("@/pages/blunder-preventer"));
const OpeningImprover = React.lazy(() => import("@/pages/opening-improver"));
const OpeningsCatalog = React.lazy(() => import("@/pages/openings"));
const OpeningTrainer = React.lazy(() => import("@/pages/opening-trainer"));
const EndgamesCatalog = React.lazy(() => import("@/pages/endgames"));
const EndgameTrainerPro = React.lazy(() => import("@/pages/endgame-trainer-pro"));
const ChampionsCatalog = React.lazy(() => import("@/pages/champions"));
const ChampionDetail = React.lazy(() => import("@/pages/champion-detail"));
const AdvantageCapitalization = React.lazy(() => import("@/pages/advantage-capitalization"));
const VisualizationTrainer = React.lazy(() => import("@/pages/visualization-trainer"));
const EndgameTrainer = React.lazy(() => import("@/pages/endgame-trainer"));
const RetryMistakes = React.lazy(() => import("@/pages/retry-mistakes"));
const CheckmatePatterns = React.lazy(() => import("@/pages/checkmate-patterns"));
const PatternFinder = React.lazy(() => import("@/pages/pattern-finder"));
const ThreeSixtyTrainer = React.lazy(() => import("@/pages/three-sixty-trainer"));
const DefenderTrainer = React.lazy(() => import("@/pages/defender-trainer"));
const IntuitionTrainer = React.lazy(() => import("@/pages/intuition-trainer"));
const WeeklyPlan = React.lazy(() => import("@/pages/weekly-plan"));
const MyStatistics = React.lazy(() => import("@/pages/my-statistics"));
const CoachPage = React.lazy(() => import("@/pages/coach"));
const LoginPage = React.lazy(() => import("@/pages/login"));
const AdminPricing = React.lazy(() => import("@/pages/admin-pricing"));
const AdminSiteAnalytics = React.lazy(() => import("@/pages/admin/site-analytics"));
const PricingPage = React.lazy(() => import("@/pages/pricing"));
const ThanksPage = React.lazy(() => import("@/pages/thanks"));
const AccountBillingPage = React.lazy(() => import("@/pages/account-billing"));
const AccountPage = React.lazy(() => import("@/pages/account"));
const ResetPasswordPage = React.lazy(() => import("@/pages/reset-password"));
const EmailChangePage = React.lazy(() => import("@/pages/email-change"));
const PrivacyPage = React.lazy(() => import("@/pages/legal/privacy"));
const TermsPage = React.lazy(() => import("@/pages/legal/terms"));
const RefundPage = React.lazy(() => import("@/pages/legal/refund"));
const ContactPage = React.lazy(() => import("@/pages/legal/contact"));
const PawnStructureTrainer = React.lazy(() => import("@/pages/pawn-structure-trainer"));
const PlanFinderTrainer = React.lazy(() => import("@/pages/plan-finder-trainer"));
const CalculationStudio = React.lazy(() => import("@/pages/calculation-studio"));
const TournamentsPage = React.lazy(() => import("@/pages/tournaments"));

// Phase 3/4 new pages.
const CalculationLadder = React.lazy(() => import("@/pages/calculation-ladder"));
const TimePressure = React.lazy(() => import("@/pages/time-pressure"));
const RepertoireTrainer = React.lazy(() => import("@/pages/repertoire-trainer"));
const VariantsLobby = React.lazy(() => import("@/pages/variants-lobby"));
const VariantGamePage = React.lazy(() => import("@/pages/variant-game"));

// Phase 5: giant Game Library.
const GameLibrary = React.lazy(() => import("@/pages/game-library"));
const LibraryGameViewer = React.lazy(() => import("@/pages/library-game"));

// Phase 6: Watch section (YouTube-style player, Chess Tube, MP4 export).
const WatchChannels = React.lazy(() => import("@/pages/watch/channels"));
const WatchPage = React.lazy(() => import("@/pages/watch/watch"));
const WatchCvc = React.lazy(() => import("@/pages/watch/cvc"));
const WatchCvcLive = React.lazy(() => import("@/pages/watch/cvc-live"));
const WatchChessTube = React.lazy(() => import("@/pages/watch/chess-tube"));
const WatchStudioExport = React.lazy(() => import("@/pages/watch/studio-export"));
const WatchRender = React.lazy(() => import("@/pages/watch/render"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function PageFallback() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center text-sm text-muted-foreground">
      Loading…
    </div>
  );
}

function AnalyticsSync() {
  const [loc] = useLocation();
  React.useEffect(() => {
    bootstrapConsent();
    consumeSignedUpFromUrl();
  }, []);
  React.useEffect(() => {
    trackPageView(loc);
    trackInternalPageView();
  }, [loc]);
  return null;
}

/** Dedicated shell on `goadmingo.<apex>` / `admin.<apex>` (see `isAdminHost`). */
function AdminApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <AnalyticsSync />
      <React.Suspense fallback={<PageFallback />}>
        <OperatorAuthBoundary mode="fullscreen">
          <AdminLayout>
            <Switch>
              <Route path="/" component={() => <Redirect to="/admin/site-analytics" />} />
              <Route path="/admin/site-analytics" component={AdminSiteAnalytics} />
              <Route path="/admin/pricing" component={AdminPricing} />
              <Route component={NotFound} />
            </Switch>
          </AdminLayout>
        </OperatorAuthBoundary>
      </React.Suspense>
      <Toaster />
      <ConsentBanner />
    </QueryClientProvider>
  );
}

export default function App() {
  if (typeof window !== "undefined" && isAdminHost()) {
    return <AdminApp />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AnalyticsSync />
      <React.Suspense fallback={<PageFallback />}>
        <Switch>
          {/* Full-screen routes bypass the sidebar layout */}
          <Route path="/welcome" component={Landing} />
          <Route path="/onboarding" component={Onboarding} />
          <Route path="/play/tournaments" component={TournamentsPage} />
          <Route path="/play/variants/:id" component={VariantGamePage} />
          <Route path="/play/variants" component={VariantsLobby} />
          <Route path="/play" component={Play} />
          {/* Headless render route — no sidebar chrome, deterministic
              1080p layout for the MP4 export pipeline. */}
          <Route path="/watch/render" component={WatchRender} />
          {/* Marketing home — no app sidebar (landing has its own top bar) */}
          <Route path="/" component={Home} />
          <Route>
            <MainLayout>
              <Switch>
                <Route path="/analysis">
                  <RequireAuth feature="analysis">
                    <ChessTrainer />
                  </RequireAuth>
                </Route>
                <Route path="/import" component={ImportGames} />
                <Route path="/game-analysis/:id" component={GameAnalysis} />
                <Route path="/analytics" component={AnalyticsDashboard} />
                <Route
                  path="/site-analytics"
                  component={() => <Redirect to="/analytics?site=1" />}
                />
                <Route path="/admin/pricing" component={AdminPricing} />
                <Route
                  path="/admin/site-analytics"
                  component={() => <Redirect to="/analytics?site=1" />}
                />
                <Route path="/opponent-prep">
                  <RequireAuth feature="opponent">
                    <OpponentPrep />
                  </RequireAuth>
                </Route>
                <Route path="/training" component={TrainingDashboard} />
                <Route path="/training/tactics" component={TacticsTrainer} />
                <Route path="/training/blunder-preventer" component={BlunderPreventer} />
                <Route path="/openings" component={OpeningsCatalog} />
                <Route path="/openings/:slug" component={OpeningTrainer} />
                <Route path="/endgames" component={EndgamesCatalog} />
                <Route path="/endgames/:id" component={EndgameTrainerPro} />
                <Route path="/champions" component={ChampionsCatalog} />
                <Route path="/champions/:id" component={ChampionDetail} />
                <Route path="/training/opening-improver" component={OpeningImprover} />
                <Route path="/training/advantage" component={AdvantageCapitalization} />
                <Route path="/training/visualization" component={VisualizationTrainer} />
                <Route path="/training/endgame" component={EndgameTrainer} />
                <Route path="/training/retry" component={RetryMistakes} />
                <Route path="/training/checkmate-patterns" component={CheckmatePatterns} />
                <Route path="/discover" component={PatternFinder} />
                {/* Back-compat: old route still serves the same page so
                    saved searches and shared links keep working. */}
                <Route path="/training/pattern-finder" component={PatternFinder} />
                <Route path="/training/360" component={ThreeSixtyTrainer} />
                <Route path="/training/defender" component={DefenderTrainer} />
                {/* `time-trainer` was folded into Time Pressure — keep the old
                    path working so deep links and analytics CTAs don't 404. */}
                <Route path="/training/time-trainer" component={TimePressure} />
                <Route path="/training/intuition" component={IntuitionTrainer} />
                <Route path="/training/plan">
                  <RequireTrainingPro feature="weekly_plan">
                    <WeeklyPlan />
                  </RequireTrainingPro>
                </Route>
                <Route path="/training/calculation-ladder">
                  <RequireTrainingPro feature="calculation_ladder">
                    <CalculationLadder />
                  </RequireTrainingPro>
                </Route>
                <Route path="/training/time-pressure">
                  <RequireTrainingPro feature="time_pressure">
                    <TimePressure />
                  </RequireTrainingPro>
                </Route>
                <Route path="/training/repertoire">
                  <RequireTrainingPro feature="repertoire">
                    <RepertoireTrainer />
                  </RequireTrainingPro>
                </Route>
                <Route path="/library" component={GameLibrary} />
                <Route path="/library/games/:id" component={LibraryGameViewer} />
                <Route path="/watch" component={WatchChannels} />
                <Route path="/watch/channels/:slug" component={WatchChannels} />
                <Route path="/watch/games/:id" component={WatchPage} />
                <Route path="/watch/cvc" component={WatchCvc} />
                <Route path="/watch/cvc/live/:id" component={WatchCvcLive} />
                <Route path="/watch/studio" component={WatchChessTube} />
                <Route path="/watch/export" component={WatchStudioExport} />
                <Route path="/statistics" component={MyStatistics} />
                <Route path="/coach">
                  <RequireAuth feature="coach">
                    <CoachPage />
                  </RequireAuth>
                </Route>
                <Route path="/login" component={LoginPage} />
                <Route path="/signup" component={LoginPage} />
                <Route path="/reset-password" component={ResetPasswordPage} />
                <Route path="/email-change" component={EmailChangePage} />
                <Route path="/pricing" component={PricingPage} />
                <Route path="/thanks" component={ThanksPage} />
                <Route path="/account/billing" component={AccountBillingPage} />
                <Route path="/account" component={AccountPage} />
                <Route path="/legal/privacy" component={PrivacyPage} />
                <Route path="/legal/terms" component={TermsPage} />
                <Route path="/legal/refund" component={RefundPage} />
                <Route path="/legal/contact" component={ContactPage} />
                <Route path="/training/pawn-structures">
                  <RequireTrainingPro feature="pawn_structures">
                    <PawnStructureTrainer />
                  </RequireTrainingPro>
                </Route>
                <Route path="/training/plans">
                  <RequireTrainingPro feature="plan_finder">
                    <PlanFinderTrainer />
                  </RequireTrainingPro>
                </Route>
                <Route path="/training/calculation-studio">
                  <RequireTrainingPro feature="calculation_studio">
                    <CalculationStudio />
                  </RequireTrainingPro>
                </Route>
                <Route component={NotFound} />
              </Switch>
            </MainLayout>
          </Route>
        </Switch>
      </React.Suspense>
      <Toaster />
      <ConsentBanner />
      <SupportChatWidget />
    </QueryClientProvider>
  );
}
