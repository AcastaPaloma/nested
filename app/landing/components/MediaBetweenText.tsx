"use client"

import useScreenSize from "@/hooks/use-screen-size"
import MediaBetweenText from "@/components/fancy/blocks/media-between-text"
import Typewriter from "@/components/fancy/text/typewriter"

interface MediaBetweenTextHeadProps {
  onImageHover?: () => void
}

export default function MediaBetweenTextHead({ onImageHover }: MediaBetweenTextHeadProps) {
  const screenSize = useScreenSize()

  return (
    <div className="w-dvw h-dvh flex flex-col items-center justify-center bg-black relative z-10" style={{ fontFamily: 'var(--font-majormonodisplay)' }}>
      <div className="flex flex-row flex-wrap items-center justify-center px-4 gap-1 sm:gap-2">
        <a
          href="https://www.instagram.com/p/C3oL4euoc2l/?img_index=1"
          target="_blank"
          rel="noreferrer"
          onMouseEnter={onImageHover}
        >
          <MediaBetweenText
            firstText="that's a nice ("
            secondText=")"
            mediaUrl={
              "/images/landing/lightbulb.jpg"
            }
            mediaType="image"
            triggerType="hover"
            mediaContainerClassName="w-full h-[30px] sm:h-[100px] overflow-hidden mx-px mt-1 sm:mx-2 sm:mt-4"
            className="cursor-pointer sm:text-6xl text-2xl text-[#FCBFB7] lowercase font-light flex flex-row items-center justify-center"
            animationVariants={{
              initial: { width: 0 },
              animate: {
                width: screenSize.lessThan("sm") ? "30px" : "100px",
                transition: { duration: 0.4, type: "spring", bounce: 0 },
              },
            }}
          />
        </a>

        <Typewriter
          text={[
            "idea.",
            "thought.",
            "vision.",
            "dream.",
            "project.",
          ]}
          speed={70}
          className="text-[#FCBFB7] text-2xl sm:text-6xl lowercase font-light"
          waitTime={1500}
          deleteSpeed={40}
          cursorChar={" $"}
          cursorClassName="ml-0 text-[#D3F6DB]"
        />
      </div>
    </div>
  )
}
