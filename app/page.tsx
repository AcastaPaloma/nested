"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Sparkles,
  MessageCircle,
  Blocks,
  Eye,
  GitBranch,
  ArrowRight,
  Zap,
  Shield,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";

export default function Home() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  // Redirect authenticated users to dashboard
  useEffect(() => {
    if (!isLoading && user) {
      router.push("/dashboard");
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-gray-300 border-t-gray-600 rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <span className="font-bold text-xl text-gray-900">Nested</span>
            </div>
            <div className="flex items-center gap-4">
              <Link href="/login">
                <Button variant="ghost">Sign In</Button>
              </Link>
              <Link href="/login">
                <Button>Get Started</Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <Badge variant="secondary" className="mb-6">
            <Sparkles className="h-3 w-3 mr-1" />
            Rethinking Human-AI Interaction
          </Badge>
          <h1 className="text-5xl sm:text-6xl font-bold text-gray-900 mb-6 leading-tight">
            AI Conversations<br />
            <span className="bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
              You Can See
            </span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Nested brings transparency and structure to AI interactions.
            Visual canvases, explicit context control, and collaborative planning.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/login">
              <Button size="lg" className="gap-2 text-base px-8">
                Start Building
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="#features">
              <Button variant="outline" size="lg" className="text-base px-8">
                Learn More
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Feature Cards */}
      <section id="features" className="py-20 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Two Powerful Canvases
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Different tools for different needs. Both designed for clarity and control.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Conversation Canvas */}
            <div className="bg-white rounded-2xl border border-gray-200 p-8 hover:shadow-lg transition-shadow">
              <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center mb-6">
                <MessageCircle className="h-7 w-7 text-blue-600" />
              </div>
              <h3 className="text-2xl font-semibold text-gray-900 mb-3">
                Conversation Graph
              </h3>
              <p className="text-gray-600 mb-6">
                Visual branching conversations. See your chat history as a graph.
                Control exactly what context goes to the AI with a single click.
              </p>
              <ul className="space-y-3 mb-6">
                <li className="flex items-center gap-3 text-gray-700">
                  <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                    <GitBranch className="h-3 w-3 text-blue-600" />
                  </div>
                  Explicit conversation branching
                </li>
                <li className="flex items-center gap-3 text-gray-700">
                  <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                    <Eye className="h-3 w-3 text-blue-600" />
                  </div>
                  Context Lens transparency panel
                </li>
                <li className="flex items-center gap-3 text-gray-700">
                  <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                    <Shield className="h-3 w-3 text-blue-600" />
                  </div>
                  Reduced cognitive load
                </li>
              </ul>
              <Link href="/login" className="text-blue-600 font-medium flex items-center gap-1 hover:gap-2 transition-all">
                Try it now <ChevronRight className="h-4 w-4" />
              </Link>
            </div>

            {/* Builder Canvas */}
            <div className="bg-white rounded-2xl border border-gray-200 p-8 hover:shadow-lg transition-shadow">
              <div className="w-14 h-14 bg-purple-100 rounded-xl flex items-center justify-center mb-6">
                <Blocks className="h-7 w-7 text-purple-600" />
              </div>
              <h3 className="text-2xl font-semibold text-gray-900 mb-3">
                MVP Builder
              </h3>
              <p className="text-gray-600 mb-6">
                Plan your product visually. Define pages, features, APIs, and let
                AI build an MVP based on your canvas.
              </p>
              <ul className="space-y-3 mb-6">
                <li className="flex items-center gap-3 text-gray-700">
                  <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center">
                    <Blocks className="h-3 w-3 text-purple-600" />
                  </div>
                  Structured block types
                </li>
                <li className="flex items-center gap-3 text-gray-700">
                  <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center">
                    <Zap className="h-3 w-3 text-purple-600" />
                  </div>
                  Whiteboard photo import
                </li>
                <li className="flex items-center gap-3 text-gray-700">
                  <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center">
                    <Sparkles className="h-3 w-3 text-purple-600" />
                  </div>
                  AI-powered MVP generation
                </li>
              </ul>
              <Link href="/login" className="text-purple-600 font-medium flex items-center gap-1 hover:gap-2 transition-all">
                Start planning <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Why Different */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Why is this different?
          </h2>
          <p className="text-gray-600 mb-12 max-w-2xl mx-auto">
            Traditional chat interfaces are linear and opaque. You don't know what the AI "remembers"
            or how to control its context. Nested makes everything visible and controllable.
          </p>

          <div className="grid sm:grid-cols-3 gap-8">
            <div>
              <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Eye className="h-6 w-6 text-emerald-600" />
              </div>
              <h4 className="font-semibold text-gray-900 mb-2">Transparency</h4>
              <p className="text-sm text-gray-600">
                See exactly what context is sent to the AI. No hidden prompts.
              </p>
            </div>
            <div>
              <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                <GitBranch className="h-6 w-6 text-amber-600" />
              </div>
              <h4 className="font-semibold text-gray-900 mb-2">Structure</h4>
              <p className="text-sm text-gray-600">
                Organize conversations visually. Branch, reference, and manage complexity.
              </p>
            </div>
            <div>
              <div className="w-12 h-12 bg-rose-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                <Zap className="h-6 w-6 text-rose-600" />
              </div>
              <h4 className="font-semibold text-gray-900 mb-2">Cost Control</h4>
              <p className="text-sm text-gray-600">
                Smart routing uses small models first. Only escalate when needed.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-gradient-to-br from-purple-600 to-blue-600">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to try a new way of working with AI?
          </h2>
          <p className="text-white/80 mb-8">
            Start with the conversation graph or jump straight to building your MVP.
          </p>
          <Link href="/login">
            <Button size="lg" variant="secondary" className="text-base px-8">
              Get Started Free
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-4 text-center text-sm text-gray-500">
          <p>Built with ❤️ for the Backboard.io competition</p>
        </div>
      </footer>
    </div>
  );
}
