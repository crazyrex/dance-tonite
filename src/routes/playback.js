import Orb from '../orb';
import audio from '../audio';
import audioSrc from '../public/sound/lcd-14loops.ogg';
import Playlist from '../playlist';
import viewer from '../viewer';
import settings from '../settings';

const { roomDepth, roomOffset } = settings;

let orb;
let playlist;
let tick;

export default {
  hud: {
    menuList: true,
  },

  mount: () => {
    viewer.switchCamera('orthographic');
    orb = new Orb();

    const moveCamera = (progress) => {
      const z = ((progress - 1.5) * roomDepth) + roomOffset;
      viewer.camera.position.z = z;
      orb.move(z);
    }

    moveCamera(0);

    playlist = new Playlist('curated', () => {
      // Audio plays after playlist is done loading:
      audio.load({
        src: audioSrc,
        loops: 16,
      }, (loadError) => {
        if (loadError) throw loadError;
        audio.play();
      });

      tick = () => {
        audio.tick();
        playlist.tick();
        moveCamera(audio.progress);
      };

      viewer.events.on('tick', tick);
    });
  },

  unmount: () => {
    viewer.events.off('tick', tick);
    orb.destroy();
    playlist.destroy();
  },
};
