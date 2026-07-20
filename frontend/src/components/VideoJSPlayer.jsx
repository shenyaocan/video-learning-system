import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import videojs from 'video.js'
import 'video.js/dist/video-js.css'

const VideoJSPlayer = forwardRef(({ 
  src, 
  playbackRate = 1.0, 
  width = 640, 
  height = 360,
  onTimeUpdate,
  onLoadedMetadata,
  onPlay,
  onPause,
  onEnded,
  onError,
  onWaiting,
  onCanPlay
}, ref) => {
  const videoRef = useRef(null)
  const playerRef = useRef(null)

  useImperativeHandle(ref, () => ({
    play: () => playerRef.current?.play(),
    pause: () => playerRef.current?.pause(),
    seekTo: (time) => playerRef.current?.currentTime(time),
    getCurrentTime: () => playerRef.current?.currentTime(),
    getDuration: () => playerRef.current?.duration(),
    setPlaybackRate: (rate) => playerRef.current?.playbackRate(rate),
    getPlaybackRate: () => playerRef.current?.playbackRate(),
    load: () => playerRef.current?.load(),
    src: (srcObj) => playerRef.current?.src(srcObj),
    reset: () => {
      if (playerRef.current) {
        playerRef.current.dispose()
        playerRef.current = null
      }
    },
    getPlayer: () => playerRef.current,
    isReady: () => !!playerRef.current
  }))

  useEffect(() => {
    if (!videoRef.current) return

    const player = videojs(videoRef.current, {
      controls: false,
      autoplay: false,
      preload: 'auto',
      fluid: false,
      responsive: false,
      playbackRates: [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.3, 2.5, 3.0],
      html5: {
        vhs: {
          overrideNative: true
        },
        nativeVideoTracks: false,
        nativeAudioTracks: false,
        nativeTextTracks: false
      }
    })

    playerRef.current = player

    player.on('timeupdate', () => {
      if (onTimeUpdate) {
        onTimeUpdate(player.currentTime(), player.duration())
      }
    })

    player.on('loadedmetadata', () => {
      if (onLoadedMetadata) {
        onLoadedMetadata(player.duration())
      }
    })

    player.on('play', () => {
      if (onPlay) onPlay()
    })

    player.on('pause', () => {
      if (onPause) onPause()
    })

    player.on('ended', () => {
      if (onEnded) onEnded()
    })

    player.on('error', () => {
      if (onError) onError(player.error())
    })

    player.on('waiting', () => {
      if (onWaiting) onWaiting()
    })

    player.on('canplay', () => {
      if (onCanPlay) onCanPlay()
    })

    return () => {
      if (playerRef.current) {
        playerRef.current.dispose()
        playerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (playerRef.current && src) {
      playerRef.current.src({ type: 'video/mp4', src })
      playerRef.current.playbackRate(playbackRate)
    }
  }, [src])

  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.playbackRate(playbackRate)
    }
  }, [playbackRate])

  return (
    <div className="video-js-wrapper">
      <video
        ref={videoRef}
        className="video-js vjs-big-play-centered"
        width={width}
        height={height}
        playsInline
        disablePictureInPicture
        x5-video-player-type="h5"
        x5-video-player-fullscreen="true"
        webkit-playsinline="true"
        x-webkit-airplay="allow"
      />
    </div>
  )
})

VideoJSPlayer.displayName = 'VideoJSPlayer'

export default VideoJSPlayer