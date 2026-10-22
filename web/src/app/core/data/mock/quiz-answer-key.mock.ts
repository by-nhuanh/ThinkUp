// TODO(pre-deploy): Nhớ xóa khóa đáp án mẫu này; production chỉ nhận kết quả chấm từ Quiz API và không đưa đáp án vào bundle frontend.
export const MOCK_QUIZ_ANSWER_KEYS: Record<string, Record<string, string>> = {
  'quiz-basics': { q1: 'a', q2: 'b', q3: 'c' }
};
