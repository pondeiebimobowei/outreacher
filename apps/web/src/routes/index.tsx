import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight, Mail, Users, Zap } from 'lucide-react'

export const Route = createFileRoute("/")({
  component: LandingPage,
})

function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen font-sans bg-gray-50 text-gray-900">
      {/* Header */}
      <header className="px-6 lg:px-8 py-4 flex items-center justify-between border-b border-gray-200 bg-white shadow-sm sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Mail className="h-6 w-6 text-indigo-600" />
          <span className="text-xl font-bold tracking-tight text-gray-900">Outreacher</span>
        </div>
        <nav className="hidden md:flex gap-6">
          <a href="#features" className="text-sm font-medium text-gray-600 hover:text-gray-900">Features</a>
          <a href="#pricing" className="text-sm font-medium text-gray-600 hover:text-gray-900">Pricing</a>
          <a href="#testimonials" className="text-sm font-medium text-gray-600 hover:text-gray-900">Testimonials</a>
        </nav>
        <div className="flex items-center gap-4">
          <Link to="/login" className="text-sm font-medium text-gray-600 hover:text-gray-900">Log in</Link>
          <Link to="/dashboard" className="text-sm font-medium bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors shadow-sm">
            Get Started
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative px-6 lg:px-8 py-24 sm:py-32 overflow-hidden bg-white">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-100 via-white to-white"></div>
          <div className="mx-auto max-w-4xl text-center">
            <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-gray-900 mb-8 leading-tight">
              Smarter outreach that <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">converts</span>
            </h1>
            <p className="text-lg sm:text-xl text-gray-600 mb-10 max-w-2xl mx-auto leading-relaxed">
              Automate your cold email campaigns, personalize at scale, and fill your pipeline with high-quality leads using Outreacher's AI-driven platform.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link to="/dashboard" className="w-full sm:w-auto px-8 py-4 bg-indigo-600 text-white font-semibold rounded-lg shadow-lg hover:bg-indigo-700 hover:shadow-xl transition-all flex items-center justify-center gap-2 text-lg">
                Start for free <ArrowRight className="h-5 w-5" />
              </Link>
              <a href="#demo" className="w-full sm:w-auto px-8 py-4 bg-white text-gray-700 font-semibold rounded-lg shadow border border-gray-200 hover:bg-gray-50 transition-all flex items-center justify-center text-lg">
                View demo
              </a>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-24 bg-gray-50 px-6 lg:px-8 border-t border-gray-100">
          <div className="mx-auto max-w-6xl">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Everything you need to close more deals</h2>
              <p className="text-gray-600 max-w-2xl mx-auto">Powerful features designed to help you reach the right people at the right time.</p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-10">
              <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <div className="h-12 w-12 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center mb-6">
                  <Zap className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Automated Sequences</h3>
                <p className="text-gray-600 leading-relaxed">Create complex, multi-step email sequences that automatically follow up until you get a response.</p>
              </div>
              
              <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <div className="h-12 w-12 bg-purple-100 text-purple-600 rounded-lg flex items-center justify-center mb-6">
                  <Users className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Smart Personalization</h3>
                <p className="text-gray-600 leading-relaxed">Use dynamic variables and AI to tailor every single email to the recipient for higher conversion rates.</p>
              </div>
              
              <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <div className="h-12 w-12 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center mb-6">
                  <Mail className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Deliverability Tools</h3>
                <p className="text-gray-600 leading-relaxed">Built-in warmup, spam checking, and inbox placement monitoring so your emails always land in the primary tab.</p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 bg-indigo-900 px-6 lg:px-8 text-center">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">Ready to supercharge your sales?</h2>
            <p className="text-indigo-200 text-lg mb-10 max-w-2xl mx-auto">Join thousands of companies using Outreacher to book more meetings and close more deals.</p>
            <Link to="/dashboard" className="inline-flex px-8 py-4 bg-white text-indigo-900 font-bold rounded-lg shadow-lg hover:bg-gray-100 transition-colors text-lg">
              Get Started Now
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-white py-12 px-6 lg:px-8 border-t border-gray-200 text-center text-gray-500 text-sm">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Mail className="h-5 w-5 text-gray-400" />
          <span className="font-bold text-gray-700">Outreacher</span>
        </div>
        <p>&copy; {new Date().getFullYear()} Outreacher Inc. All rights reserved.</p>
      </footer>
    </div>
  )
}
