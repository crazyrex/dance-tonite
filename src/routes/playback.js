import Orb from '../orb';
import audio from '../audio';
import audioSrcOgg from '../public/sound/tonite.ogg';
import audioSrcMp3 from '../public/sound/tonite.mp3';
import Playlist from '../playlist';
import viewer from '../viewer';
import settings from '../settings';
import about from '../about';
import titles from '../titles';
import transition from '../transition';
import hud from '../hud';
import feature from '../utils/feature';
import { sleep } from '../utils/async';
import Room from '../room';

// Chromium does not support mp3:
// TODO: Switch to always use MP3 in production.
const audioSrc = feature.isChrome ? audioSrcOgg : audioSrcMp3;
const { roomDepth, roomOffset, holeHeight } = settings;

const enterDaydreamTransition = (immediate) => {
  titles.hide();
  return transition.enter({
    text: 'Put your hand up when you are ready',
    immediate,
  });
};



export default (req) => {
  const toggleVR = async () => {
    if (!feature.hasVR) return;
    if (viewer.vrEffect.isPresenting) {
      viewer.vrEffect.exitPresent();
      viewer.switchCamera('orthographic');
    } else {
      viewer.vrEffect.requestPresent();
      const removeMessage = hud.enterVR();
      await audio.fadeOut();
      viewer.switchCamera('default');
      if (feature.isIODaydream) {
        viewer.daydreamController.addEventListener('touchpaddown', this.component.onclick)
        enterDaydreamTransition(true);
      } else {
        await sleep(1000);
        audio.pause();
        audio.rewind();
        await sleep(4000);
        removeMessage();
      }
      audio.play();
    }
  };

  const hudSettings = {
    menuAdd: !feature.isIODaydream,
    menuEnter: toggleVR,
    aboutButton: !feature.isIO && about.toggle,
    colophon: !feature.isIO,
    chromeExperiment: true,
  };

  let orb;
  let playlist;
  let tick;
  let progressBar;

  const restartPlayback = () => {
    audio.rewind();
    audio.play();
  };

  const component = {
    hud: hudSettings,
    mount: async () => {
      if (feature.isIODaydream) {
        hud.create(
          'div.io-emulate-button', {
            onclick: async () => {
              if (!viewer.vrEffect.isPresenting) {
                restartPlayback();
                return;
              }
              audio.pause();
              if (transition.isInside()) {
                await transition.fadeOut();
                restartPlayback();
                transition.exit();
              } else {
                enterDaydreamTransition();
              }
            },
          },
          'Press to emulate DayDream controller button'
        );
      }
      progressBar = hud.create('div.audio-progress-bar');

      titles.mount();
      if (!viewer.vrEffect.isPresenting) {
        viewer.switchCamera('orthographic');
      }

      orb = new Orb();

      const moveCamera = (progress) => {
        const emptySpace = 2.5;
        const z = ((progress - emptySpace) * roomDepth) + roomOffset;
        viewer.camera.position.set(0, holeHeight, -z);
        orb.move(-z);
      };

      moveCamera(0);
      Room.rotate180();
      playlist = new Playlist();

      tick = () => {
        daydreamController.update()
        if (transition.isInside()) return;
        audio.tick();
        playlist.tick();
        titles.tick();
        progressBar.style.transform = `scaleX(${audio.progress / settings.totalLoopCount})`;
        moveCamera(audio.progress);
      };

      hud.showLoader('Loading sound');

      await audio.load({
        src: audioSrc,
        loops: settings.totalLoopCount,
        // Don't loop on daydream and vive stations during IO:
        loop: !(feature.isIODaydream || feature.isIOVive),
        progressive: true,
      });
      if (component.destroyed) return;

      hud.showLoader('Gathering user performances');
      await playlist.load({
        url: 'curated.json',
        pathRecording: req.params.id,
        loopIndex: parseInt(req.params.loopIndex, 10),
      });
      if (component.destroyed) return;

      hud.hideLoader();
      if (transition.isInside()) {
        transition.exit();
      }
      audio.play();
      viewer.events.on('tick', tick);
    },

    unmount: () => {
      component.destroyed = true;
      if (viewer.vrEffect.isPresenting) {
        viewer.vrEffect.exitPresent();
      }
      audio.reset();
      viewer.events.off('tick', tick);
      orb.destroy();
      titles.destroy();
      playlist.destroy();
    },
  };
  return component;
};
