import styles from './Equalizer.module.css';

/** Three bouncing bars: "this is sounding now". Static under reduced motion. */
export function Equalizer(){return <span className={styles.eq} aria-hidden="true"><i/><i/><i/></span>;}
