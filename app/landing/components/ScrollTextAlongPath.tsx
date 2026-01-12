"use client"

import AnimatedPathText from "@/components/fancy/text/text-along-path"

export default function ScrollTextAlongPath() {
  // Multiple parallel paths for multiline text
  const paths = [
    "M50 200 Q200 150, 350 200 T650 200 T950 200",
    "M50 250 Q200 200, 350 250 T650 250 T950 250",
    "M50 300 Q200 250, 350 300 T650 300 T950 300",
    "M50 350 Q200 300, 350 350 T650 350 T950 350",
  ]

  // Split text into multiple lines
  const texts = [
    "chatgpt. claude. gemini.",
    "honestly it's the same shit.",
    "you create new convos every time. ",
    "no organization at all. no way to find your work.",
  ]

  return (
    <div
      className="w-full h-[200vh] relative bg-black z-10"
      style={{ fontFamily: 'var(--font-majormonodisplay)' }}
    >
      <div className="sticky w-full top-0 h-screen flex items-center">
        <div className="w-full h-full relative">
          {paths.map((path, i) => (
            <AnimatedPathText
              key={`nested-path-${i}`}
              path={path}
              pathId={`nested-scroll-path-${i}`}
              svgClassName="absolute left-0 top-0 w-full h-full"
              viewBox="0 0 1000 500"
              text={texts[i]}
              textClassName="text-sm sm:text-lg md:text-xl font-light fill-[#FCBFB7]"
              animationType="scroll"
              scrollTransformValues={[-100, 120]}
              scrollOffset={["start end", "end start"]}
              textAnchor="start"
            />
          ))}
        </div>
      </div>
    </div>
  )
}
