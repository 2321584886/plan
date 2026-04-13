import { useParams } from 'react-router-dom';

import PaperGoldDetail from './PaperGoldDetail';
import SubCategoryDetail from './SubCategoryDetail';

export default function FinanceSubRoute() {
  const { subId } = useParams();

  if (String(subId) === '4') {
    return <PaperGoldDetail />;
  }

  return <SubCategoryDetail />;
}
