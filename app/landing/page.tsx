"use client"

import React, { useState, useEffect } from 'react'

/// ========== Components ========== //
import MediaBetweenTextHead from './components/MediaBetweenText'
import ScrollTextAlongPath from './components/ScrollTextAlongPath'
import ParallaxGetStarted from './components/ParallaxGetStarted'

const page = () => {
  const [showScrollPrompt, setShowScrollPrompt] = useState(false)
  const [hasShownPrompt, setHasShownPrompt] = useState(false)
  const [promptOpacity, setPromptOpacity] = useState(1)

  const handleImageHover = () => {
    if (!hasShownPrompt) {
      setTimeout(() => {
        setShowScrollPrompt(true)
        setHasShownPrompt(true)
      }, 1000)
    }
  }

  useEffect(() => {
    const handleScroll = () => {
      if (showScrollPrompt && window.scrollY > 50) {
        setPromptOpacity(0)
        setTimeout(() => setShowScrollPrompt(false), 1000)
      }
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [showScrollPrompt])

  return (
    <div style={{ fontFamily: 'var(--font-majormonodisplay)' }} className="bg-black">
      <MediaBetweenTextHead onImageHover={handleImageHover} />

      <ScrollTextAlongPath />

      <ParallaxGetStarted />

      {showScrollPrompt && (
        <div
          className="fixed bottom-8 left-1/2 -translate-x-1/2 text-center transition-opacity duration-1000 ease-out z-50"
          style={{
            backgroundColor: 'transparent',
            color: '#FCBFB7',
            fontSize: '1.2rem',
            padding: '0.5rem 1rem',
            opacity: promptOpacity,
            animation: promptOpacity === 1 ? 'fadeIn 1.5s ease-in forwards' : 'none'
          }}
        >
          ↓ scroll down ↓
        </div>
      )}

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>
    </div>
  )
}

export default page