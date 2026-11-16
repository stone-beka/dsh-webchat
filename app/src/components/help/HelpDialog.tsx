import { useTranslate } from '../../i18n/index.js'
import { privacyUrl, termsUrl, UPSTREAM_URL } from '../../services/policies.js'
import { useSettings } from '../../services/settings.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import { closeHelp, useHelpDialog } from './helpState.js'
import styles from './HelpDialog.module.css'

/** 帮助与反馈：本机实例的常见问题 + 官方协议与实际来源链接 */
export const HelpDialog = () => {
  const open = useHelpDialog((state) => state.open)
  return open ? <HelpContent /> : null
}

const HelpContent = () => {
  const t = useTranslate()
  const locale = useSettings((state) => state.locale)
  const faq: { question: string; answer: string }[] = [
    { question: t('helpKeyQ'), answer: t('helpKeyA') },
    { question: t('helpDataQ'), answer: t('helpDataA') },
    { question: t('helpTreeQ'), answer: t('helpTreeA') },
    { question: t('helpReloadQ'), answer: t('helpReloadA') },
    { question: t('helpServerQ'), answer: t('helpServerA') },
  ]
  return (
    <Modal
      title={t('helpTitle')}
      closable
      className={styles.dialog}
      mainClassName={styles.main}
      onClose={closeHelp}
      footer={
        <Button variant="primary" autoFocus onClick={closeHelp}>
          {t('helpClose')}
        </Button>
      }
    >
      <h3 className={styles.heading}>{t('helpFaqHeading')}</h3>
      <dl className={styles.faq}>
        {faq.map((item) => (
          <div key={item.question} className={styles.item}>
            <dt className={styles.question}>{item.question}</dt>
            <dd className={styles.answer}>{item.answer}</dd>
          </div>
        ))}
      </dl>
      <h3 className={styles.heading}>{t('helpFeedbackHeading')}</h3>
      <p className={styles.text}>{t('helpFeedbackText')}</p>
      <div className={styles.links}>
        <a href={termsUrl(locale)} target="_blank" rel="noreferrer">
          {t('helpOpenTerms')}
        </a>
        <a href={privacyUrl(locale)} target="_blank" rel="noreferrer">
          {t('helpOpenPrivacy')}
        </a>
        <a href={UPSTREAM_URL} target="_blank" rel="noreferrer">
          {t('helpUpstream')}
        </a>
      </div>
    </Modal>
  )
}
