import type {HomeDestination} from '../../../app/navigation';
import {Glyph} from '../../../shared/ui/PaperIcon';
import {Logo} from '../../../shared/ui/Logo';
import {useAccount} from '../../../shared/account/AccountProvider';
import styles from '../HomePage.module.css';
export function HomeHeader({onNavigate}:{onNavigate:(page:HomeDestination)=>void}){const {account}=useAccount();return <header className={styles.header}>
 <p className={styles.brand}><Logo/></p>
 <nav className={styles.nav} aria-label="主导航">
  <button type="button" onClick={()=>onNavigate('shelf')}><Glyph name="shelf"/>作品书架</button>
  <button type="button" onClick={()=>onNavigate('login')}><Glyph name="person"/><span>{account?'老师账号':'登录'}</span></button>
  <button type="button" onClick={()=>onNavigate('api')}><Glyph name="settings"/><span>API 输入</span></button>
 </nav>
</header>;}
