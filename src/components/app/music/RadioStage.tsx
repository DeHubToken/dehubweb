/**
 * RadioStage
 * ==========
 * The selected station on the Music tab's radio chart, sized to fill its half
 * of the chart: the logo large over a blurred copy of itself, what the
 * directory knows about the station (country, quality, votes, plays) and the
 * controls to listen, skip to the next station on the chart or share it.
 *
 * Station logos are the stream's own artwork, so the stage keeps its dark
 * backdrop and white type on every theme (data-keep-dark).
 *
 * @module components/app/music/RadioStage
 */

import { useState } from 'react';
import { useTranslation as _useCopy } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import Radio from '@/components/ui/cut-icons/live';
import Play from '@/components/ui/cut-icons/play';
import Pause from '@/components/ui/cut-icons/pause';
import NextTrack from '@/components/ui/cut-icons/next-track';
import Share from '@/components/ui/cut-icons/share';
import { useRadioPlayer } from '@/hooks/use-radio-player';
import { getCustomLogo } from '@/components/app/radio/RadioStationCard';
import { getCountryFlag, getPrimaryTags, type RadioStation } from '@/lib/api/radio-browser';

const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });

export function RadioStage({ station, onNext }: { station: RadioStation; onNext?: () => void }) {
  const { t: _copy } = _useCopy();
  const { currentStation, isPlaying, isLoading, play, togglePlayPause } = useRadioPlayer();
  const [logoFailed, setLogoFailed] = useState(false);

  const isCurrent = currentStation?.stationuuid === station.stationuuid;
  const onAir = isCurrent && isPlaying;
  const logo = logoFailed ? null : getCustomLogo(station.name) || station.favicon || null;
  const tags = getPrimaryTags(station.tags, 3);
  const quality = [station.bitrate > 0 ? `${station.bitrate} kbps` : '', station.codec].filter(Boolean).join(' · ');

  const facts = [
    { label: _copy('music.country', { defaultValue: 'Country' }), value: station.country ? `${getCountryFlag(station.countrycode)} ${station.country}` : '' },
    { label: _copy('music.quality', { defaultValue: 'Quality' }), value: quality },
    { label: _copy('music.votes', { defaultValue: 'Votes' }), value: station.votes ? compact.format(station.votes) : '' },
    { label: _copy('music.plays', { defaultValue: 'Plays' }), value: station.clickcount ? compact.format(station.clickcount) : '' },
  ].filter(fact => fact.value);

  const listen = () => (isCurrent ? togglePlayPause() : play(station));

  const share = async () => {
    const url = `${window.location.origin}/music`;
    const title = _copy('music.shareStationTitle', { defaultValue: '{{name}} on DeHub Radio', name: station.name });
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(`${title} ${url}`);
      toast.success(_copy('music.linkCopied', { defaultValue: 'Link copied' }));
    } catch {
      // The share sheet was closed; nothing to do.
    }
  };

  return (
    <div data-radio-stage data-keep-dark>
      {logo && <img data-radio-stage-backdrop src={logo} alt="" aria-hidden="true" />}
      <div data-radio-stage-body>
        <div data-radio-stage-head>
          <div data-radio-stage-logo>
            {logo ? <img src={logo} alt={station.name} onError={() => setLogoFailed(true)} /> : <Radio className="h-12 w-12 text-white/70" />}
          </div>
          <div data-radio-stage-title>
            <span data-radio-stage-air data-live={onAir || undefined}>
              <span aria-hidden="true" />
              {onAir ? _copy('music.onAir', { defaultValue: 'On air' }) : _copy('music.liveRadio', { defaultValue: 'Live radio' })}
            </span>
            <h3>{station.name}</h3>
            {tags.length > 0 && <div data-radio-stage-tags>{tags.map(tag => <span key={tag}>{tag}</span>)}</div>}
          </div>
        </div>
        {facts.length > 0 && (
          <dl data-radio-stage-facts>
            {facts.map(fact => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}
          </dl>
        )}
        <div data-radio-stage-actions>
          <button type="button" data-radio-stage-listen onClick={listen}>
            {isCurrent && isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : onAir ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            {onAir ? _copy('music.pause', { defaultValue: 'Pause' }) : _copy('music.listenLive', { defaultValue: 'Listen live' })}
          </button>
          {onNext && (
            <button type="button" data-radio-stage-round onClick={onNext} aria-label={_copy('music.nextStation', { defaultValue: 'Next station' })} title={_copy('music.nextStation', { defaultValue: 'Next station' })}>
              <NextTrack className="h-5 w-5" />
            </button>
          )}
          <button type="button" data-radio-stage-round onClick={share} aria-label={_copy('music.shareStation', { defaultValue: 'Share station' })} title={_copy('music.shareStation', { defaultValue: 'Share station' })}>
            <Share className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
