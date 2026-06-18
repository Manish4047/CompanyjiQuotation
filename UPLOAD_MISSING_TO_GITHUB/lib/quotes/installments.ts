export type InstallmentDetail = {
  id: string;
  postpaidFee: number;
  firstInstallment: number;
};

export function applyQuoteDiscountToInstallments<T extends InstallmentDetail>(items: T[], discountAmount: number) {
  const totalPostpaidFee = items.reduce((sum, item) => sum + Math.max(0, item.postpaidFee), 0);
  const safeDiscount = Math.max(0, Math.min(Math.round(discountAmount || 0), totalPostpaidFee));

  if (!items.length || safeDiscount === 0 || totalPostpaidFee === 0) {
    return items.map((item) => ({
      ...item,
      firstInstallment: Math.min(Math.max(0, item.firstInstallment), Math.max(0, item.postpaidFee)),
      secondInstallment: Math.max(0, item.postpaidFee - Math.min(Math.max(0, item.firstInstallment), Math.max(0, item.postpaidFee))),
      discountedPostpaidFee: Math.max(0, item.postpaidFee),
      discountShare: 0
    }));
  }

  let remainingDiscount = safeDiscount;

  return items.map((item, index) => {
    const safePostpaidFee = Math.max(0, item.postpaidFee);
    const share =
      index === items.length - 1
        ? remainingDiscount
        : Math.min(remainingDiscount, Math.round((safeDiscount * safePostpaidFee) / totalPostpaidFee));

    remainingDiscount -= share;

    const discountedPostpaidFee = Math.max(0, safePostpaidFee - share);
    const firstInstallment = Math.min(Math.max(0, item.firstInstallment), discountedPostpaidFee);
    const secondInstallment = Math.max(0, discountedPostpaidFee - firstInstallment);

    return {
      ...item,
      firstInstallment,
      secondInstallment,
      discountedPostpaidFee,
      discountShare: share
    };
  });
}
